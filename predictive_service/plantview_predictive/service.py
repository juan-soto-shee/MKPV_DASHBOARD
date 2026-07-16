from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .config import settings
from .modeling import HORIZONS, InsufficientDataError, new_version, predict, train_competition


class PredictiveService:
    def __init__(self, repository: Any):
        self.repository = repository

    def retrain(self, context: dict[str, str], user: dict[str, Any]) -> dict[str, Any]:
        if context["profileId"] != settings.allowed_profile_id:
            raise ValueError("Perfil operacional no compatible")
        records = self.repository.read_records(context)
        version = new_version()
        trained: list[dict[str, Any]] = []
        for target, horizons in HORIZONS.items():
            for horizon in horizons:
                result = train_competition(records, target, horizon, settings.minimum_pairs)
                path = "/".join(["plantview-models", context["clienteId"], context["implementationId"],
                                 context["profileId"], version, f"{target}_{horizon}h.joblib"])
                self.repository.upload_artifact(path, result["artifact"])
                trained.append({**result, "artifactPath": path})
        self.repository.activate_all(context, version, trained, user)
        return {"status": "ok", "version": version, "models": [self._public(item) for item in trained]}

    def infer_cu(self, context: dict[str, str], horizon: int, records: list[dict[str, Any]]) -> dict[str, Any]:
        if horizon not in HORIZONS["cu_pls"]:
            raise ValueError("Horizonte no soportado")
        active = self.repository.get_active(context, "cu_pls", horizon)
        if not active:
            raise LookupError("No existe un modelo activo")
        artifact = self.repository.download_artifact(active["artifactPath"])
        prediction = predict(artifact, records[-1])
        pool = self.repository.get_active(context, "pool_pls", 24)
        pool_prediction = None
        if pool:
            pool_artifact = self.repository.download_artifact(pool["artifactPath"])
            pool_prediction = {"prediction": predict(pool_artifact, records[-1]), "horizonHours": 24,
                               "model": pool["winner"], "version": pool["version"],
                               "metrics": {"mae": pool["mae"], "rmse": pool["rmse"], "r2": pool["r2"]},
                               "competition": pool["competition"]}
        return {"status": "ok", "prediction": prediction, "unit": "g/L", "recordsUsed": len(records),
                "calculatedAt": datetime.now(timezone.utc).isoformat(), "predictionHorizonHours": horizon,
                "model": {"name": active["winner"], "version": active["version"], "validationStatus": "active"},
                "metrics": {"mae": active["mae"], "rmse": active["rmse"], "r2": active["r2"]},
                "horizonData": {"winner": active["winner"], "validationMetrics": active["competition"]},
                "poolPrediction": pool_prediction}

    @staticmethod
    def _public(model: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in model.items() if key != "artifact"}
