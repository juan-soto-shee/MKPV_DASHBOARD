from __future__ import annotations

import io
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUMERIC_FEATURES = [
    "cuPls", "flujoPLS", "flujoRefino", "acidezRefino",
    "nivelPiscinaPLS", "nivelPiscinaRefino", "hora", "diaSemana",
]
CATEGORICAL_FEATURES = ["subarea", "turno"]
FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
TARGETS = {"cu_pls": "cuPls", "pool_pls": "nivelPiscinaPLS"}
HORIZONS = {"cu_pls": (4, 8, 12, 24), "pool_pls": (24,)}
SANTIAGO_TZ = timezone(timedelta(hours=-4))

logger = logging.getLogger(__name__)


class InsufficientDataError(ValueError):
    pass


@dataclass
class CandidateResult:
    name: str
    estimator: Any
    mae: float
    rmse: float
    r2: float
    duration_seconds: float


def algorithms() -> dict[str, Any]:
    result: dict[str, Any] = {
        "Linear Regression": LinearRegression(),
        "Random Forest": RandomForestRegressor(n_estimators=180, random_state=42, n_jobs=-1),
        "Gradient Boosting": GradientBoostingRegressor(random_state=42),
        "Extra Trees": ExtraTreesRegressor(n_estimators=180, random_state=42, n_jobs=-1),
    }
    try:
        from xgboost import XGBRegressor
        result["XGBoost"] = XGBRegressor(
            n_estimators=180, max_depth=5, learning_rate=.05, n_jobs=1, random_state=42
        )
    except ImportError:
        pass
    return result


def _timestamp(value: Any) -> pd.Timestamp:
    if isinstance(value, (int, float)):
        unit = "ms" if value > 100_000_000_000 else "s"
        return pd.to_datetime(value, unit=unit, utc=True, errors="coerce")
    return pd.to_datetime(value, utc=True, errors="coerce")


def normalize_records(records: list[dict[str, Any]]) -> pd.DataFrame:
    logger.info("FILTROS before=%d", len(records))
    required = ["timestampCreacion", *NUMERIC_FEATURES[:6], *CATEGORICAL_FEATURES]
    for record in records:
        missing = [field for field in required if field not in record or record.get(field) is None]
        invalid = []
        if "timestampCreacion" not in missing and pd.isna(_timestamp(record.get("timestampCreacion"))):
            invalid.append("timestampCreacion invalido")
        for field in NUMERIC_FEATURES[:6]:
            if field not in missing and pd.isna(pd.to_numeric(record.get(field), errors="coerce")):
                invalid.append(f"{field} no numerico ({type(record.get(field)).__name__})")
        for field in CATEGORICAL_FEATURES:
            if field not in missing and not str(record.get(field)).strip():
                invalid.append(f"{field} vacio")
        if missing or invalid:
            logger.warning(
                "VALIDACION discard id=%s fecha=%s hora=%s subarea=%s missing=%s invalid=%s",
                record.get("id", "--"), record.get("fecha", "--"), record.get("hora", "--"),
                record.get("subarea", "--"), missing, invalid,
            )
    frame = pd.DataFrame(records)
    if "timestampCreacion" not in frame:
        raise InsufficientDataError("Los registros no contienen timestampCreacion")
    frame["timestampCreacion"] = frame["timestampCreacion"].map(_timestamp)
    for column in NUMERIC_FEATURES[:6]:
        frame[column] = pd.to_numeric(frame.get(column), errors="coerce")
    for column in CATEGORICAL_FEATURES:
        frame[column] = frame.get(column, pd.Series(index=frame.index, dtype="object")).astype("string").str.strip()
    frame["fecha"] = frame["timestampCreacion"].dt.tz_convert(SANTIAGO_TZ).dt.strftime("%Y-%m-%d")
    frame["hora_str"] = frame["timestampCreacion"].dt.tz_convert(SANTIAGO_TZ).dt.strftime("%H:%M:%S")
    frame["hora"] = pd.to_numeric(frame["hora_str"].str.slice(0, 2), errors="coerce")
    frame["diaSemana"] = frame["timestampCreacion"].dt.dayofweek
    frame = frame.dropna(subset=["timestampCreacion", *NUMERIC_FEATURES[:6], *CATEGORICAL_FEATURES])
    frame = frame[(frame["subarea"] != "") & (frame["turno"] != "")]
    valid = frame.sort_values(["timestampCreacion", "subarea"]).drop_duplicates(
        subset=["timestampCreacion", "subarea"], keep="last"
    )
    logger.info(
        "DATASET valid=%d discarded=%d available=%s missing=%s",
        len(valid), len(records) - len(valid), sorted(valid.columns),
        sorted(set(FEATURES) - set(valid.columns)),
    )
    return valid


def _paired_frame(records: list[dict[str, Any]], target_name: str, horizon: int) -> pd.DataFrame:
    frame = normalize_records(records)
    paired_groups = []
    for _, unit in frame.groupby("subarea", sort=True):
        future = unit[["timestampCreacion", TARGETS[target_name]]].copy()
        future["timestampCreacion"] -= pd.Timedelta(hours=horizon)
        future = future.rename(columns={TARGETS[target_name]: "target"})
        paired_groups.append(unit.merge(future, on="timestampCreacion", how="inner", validate="one_to_one"))
    if not paired_groups:
        return pd.DataFrame(columns=["timestampCreacion", *FEATURES, "target"])
    paired = pd.concat(paired_groups, ignore_index=True).sort_values(["timestampCreacion", "subarea"])
    logger.info("GENERACION_PARES target=%s horizon_hours=%d pairs=%d", target_name, horizon, len(paired))
    return paired


def build_pairs(
    records: list[dict[str, Any]], target_name: str, horizon: int
) -> tuple[pd.DataFrame, pd.Series]:
    paired = _paired_frame(records, target_name, horizon)
    return paired[FEATURES], paired["target"]


def _pipeline(estimator: Any, scale_numeric: bool) -> Pipeline:
    numeric_steps: list[tuple[str, Any]] = [("imputer", SimpleImputer(strategy="median"))]
    if scale_numeric:
        numeric_steps.append(("scaler", StandardScaler()))
    preprocessing = ColumnTransformer([
        ("numeric", Pipeline(numeric_steps), NUMERIC_FEATURES),
        ("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]), CATEGORICAL_FEATURES),
    ])
    return Pipeline([("preprocessing", preprocessing), ("model", estimator)])


def train_competition(
    records: list[dict[str, Any]], target_name: str, horizon: int, minimum_pairs: int
) -> dict[str, Any]:
    paired = _paired_frame(records, target_name, horizon)
    if len(paired) < minimum_pairs:
        raise InsufficientDataError(
            f"Se requieren {minimum_pairs} pares válidos; disponibles: {len(paired)}"
        )
    timestamps = paired["timestampCreacion"].drop_duplicates().sort_values().reset_index(drop=True)
    cutoff = timestamps.iloc[max(1, int(len(timestamps) * .8))]
    train_mask = paired["timestampCreacion"] < cutoff
    valid_mask = ~train_mask
    if not train_mask.any() or not valid_mask.any():
        raise InsufficientDataError("No es posible construir una separación temporal válida")
    x_train, y_train = paired.loc[train_mask, FEATURES], paired.loc[train_mask, "target"]
    x_valid, y_valid = paired.loc[valid_mask, FEATURES], paired.loc[valid_mask, "target"]
    candidates: list[CandidateResult] = []
    for name, algorithm in algorithms().items():
        started = time.perf_counter()
        estimator = _pipeline(algorithm, scale_numeric=name == "Linear Regression")
        estimator.fit(x_train, y_train)
        predicted = estimator.predict(x_valid)
        candidates.append(CandidateResult(
            name=name, estimator=estimator,
            mae=float(mean_absolute_error(y_valid, predicted)),
            rmse=float(mean_squared_error(y_valid, predicted) ** .5),
            r2=float(r2_score(y_valid, predicted)),
            duration_seconds=time.perf_counter() - started,
        ))
    winner = min(candidates, key=lambda item: (item.rmse, item.mae, -item.r2))
    validation_status = "ready_for_review" if winner.r2 >= 0 else "rejected"
    winner.estimator.fit(paired[FEATURES], paired["target"])
    buffer = io.BytesIO()
    joblib.dump({"estimator": winner.estimator, "features": FEATURES}, buffer)
    return {
        "artifact": buffer.getvalue(), "winner": winner.name, "mae": winner.mae,
        "rmse": winner.rmse, "r2": winner.r2, "recordsUsed": len(paired),
        "trainingRecords": int(train_mask.sum()), "validationRecords": int(valid_mask.sum()),
        "trainingStart": paired.loc[train_mask, "timestampCreacion"].min().isoformat(),
        "trainingEnd": paired.loc[train_mask, "timestampCreacion"].max().isoformat(),
        "validationStart": paired.loc[valid_mask, "timestampCreacion"].min().isoformat(),
        "validationEnd": paired.loc[valid_mask, "timestampCreacion"].max().isoformat(),
        "validationStatus": validation_status, "horizon": horizon, "target": target_name,
        "durationSeconds": sum(item.duration_seconds for item in candidates),
        "competition": {item.name: {
            "mae": item.mae, "rmse": item.rmse, "r2": item.r2,
            "durationSeconds": item.duration_seconds,
        } for item in candidates},
    }


def predict(artifact: bytes, record: dict[str, Any]) -> float:
    bundle = joblib.load(io.BytesIO(artifact))
    normalized = normalize_records([record])
    if normalized.empty:
        raise ValueError("El registro no contiene todas las variables predictoras requeridas")
    result = float(bundle["estimator"].predict(normalized[bundle["features"]])[0])
    logger.info("MODELO inference_records=1 features=%s prediction=%s", bundle["features"], result)
    return result


def predict_series(artifact: bytes, records: list[dict[str, Any]], horizon: int) -> list[dict[str, Any]]:
    bundle = joblib.load(io.BytesIO(artifact))
    normalized = normalize_records(records)
    if normalized.empty:
        return []
    normalized = normalized.copy()
    normalized["predicted"] = bundle["estimator"].predict(normalized[bundle["features"]])
    normalized["operationalKey"] = normalized["fecha"].str.cat(normalized["hora_str"], sep=" ")
    santiago_naive = pd.to_datetime(normalized["fecha"] + " " + normalized["hora_str"], format="%Y-%m-%d %H:%M:%S", errors="coerce")
    normalized["operationalTimestamp"] = santiago_naive.dt.tz_localize(SANTIAGO_TZ).dt.tz_convert("UTC")
    points = []
    for operationalKey, group in normalized.groupby("operationalKey", sort=True):
        timestamp = group["operationalTimestamp"].iloc[0]
        if pd.isna(timestamp):
            continue
        weights = group["flujoPLS"].clip(lower=0)
        denominator = float(weights.sum())
        if denominator <= 0:
            continue
        points.append({
            "timestamp": timestamp.isoformat(),
            "targetTimestamp": (timestamp + pd.Timedelta(hours=horizon)).isoformat(),
            "actual": float((group["cuPls"] * weights).sum() / denominator),
            "predicted": float((group["predicted"] * weights).sum() / denominator),
        })
    return points[-42:]


def new_version() -> str:
    return datetime.now(timezone.utc).strftime("v%Y%m%dT%H%M%S%fZ")
