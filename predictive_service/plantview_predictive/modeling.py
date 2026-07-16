from __future__ import annotations

import io
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline

FEATURES = ["cuPls", "flujoRiego", "flujoRefino", "nivelPiscinaPLS", "acido", "mineral"]
TARGETS = {"cu_pls": "cuPls", "pool_pls": "nivelPiscinaPLS"}
HORIZONS = {"cu_pls": (4, 8, 12, 24), "pool_pls": (24,)}


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
        result["XGBoost"] = XGBRegressor(n_estimators=180, max_depth=5, learning_rate=.05, n_jobs=1, random_state=42)
    except ImportError:
        pass
    return result


def normalize_records(records: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(records)
    timestamp = "timestampCreacion"
    if timestamp not in frame:
        raise InsufficientDataError("Los registros no contienen timestampCreacion")
    frame[timestamp] = pd.to_datetime(frame[timestamp], utc=True, errors="coerce")
    for column in set(FEATURES + list(TARGETS.values())):
        frame[column] = pd.to_numeric(frame.get(column), errors="coerce")
    return frame.dropna(subset=[timestamp]).sort_values(timestamp).drop_duplicates(timestamp)


def build_pairs(records: list[dict[str, Any]], target_name: str, horizon: int) -> tuple[pd.DataFrame, pd.Series]:
    frame = normalize_records(records)
    future = frame[["timestampCreacion", TARGETS[target_name]]].dropna().copy()
    future["feature_time"] = future["timestampCreacion"] - pd.Timedelta(hours=horizon)
    future = future.rename(columns={TARGETS[target_name]: "target"}).sort_values("feature_time")
    paired = pd.merge_asof(
        frame.sort_values("timestampCreacion"), future,
        left_on="timestampCreacion", right_on="feature_time", direction="nearest",
        tolerance=pd.Timedelta(hours=max(1, horizon * .2)),
    ).dropna(subset=["target"])
    usable_features = [name for name in FEATURES if name != TARGETS[target_name]]
    return paired[usable_features], paired["target"]


def _pipeline(estimator: Any) -> Pipeline:
    return Pipeline([("imputer", SimpleImputer(strategy="median")), ("model", estimator)])


def train_competition(records: list[dict[str, Any]], target_name: str, horizon: int, minimum_pairs: int) -> dict[str, Any]:
    x, y = build_pairs(records, target_name, horizon)
    if len(x) < minimum_pairs:
        raise InsufficientDataError(f"Se requieren {minimum_pairs} pares válidos; disponibles: {len(x)}")
    split = max(1, int(len(x) * .8))
    x_train, x_valid, y_train, y_valid = x.iloc[:split], x.iloc[split:], y.iloc[:split], y.iloc[split:]
    candidates: list[CandidateResult] = []
    for name, algorithm in algorithms().items():
        started = time.perf_counter()
        estimator = _pipeline(algorithm)
        estimator.fit(x_train, y_train)
        predicted = estimator.predict(x_valid)
        candidates.append(CandidateResult(
            name=name, estimator=estimator,
            mae=float(mean_absolute_error(y_valid, predicted)),
            rmse=float(mean_squared_error(y_valid, predicted) ** .5),
            r2=float(r2_score(y_valid, predicted)),
            duration_seconds=time.perf_counter() - started,
        ))
    winner = min(candidates, key=lambda item: (item.rmse, item.mae))
    winner.estimator.fit(x, y)
    buffer = io.BytesIO()
    joblib.dump({"estimator": winner.estimator, "features": list(x.columns)}, buffer)
    return {
        "artifact": buffer.getvalue(), "winner": winner.name, "mae": winner.mae,
        "rmse": winner.rmse, "r2": winner.r2, "recordsUsed": len(x),
        "horizon": horizon, "target": target_name,
        "durationSeconds": sum(item.duration_seconds for item in candidates),
        "competition": {item.name: {"mae": item.mae, "rmse": item.rmse, "r2": item.r2,
                                           "durationSeconds": item.duration_seconds} for item in candidates},
    }


def predict(artifact: bytes, record: dict[str, Any]) -> float:
    bundle = joblib.load(io.BytesIO(artifact))
    values = pd.DataFrame([{feature: record.get(feature) for feature in bundle["features"]}])
    return float(bundle["estimator"].predict(values)[0])


def new_version() -> str:
    return datetime.now(timezone.utc).strftime("v%Y%m%dT%H%M%S%fZ")
