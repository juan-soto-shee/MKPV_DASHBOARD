from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .modeling import predict
from .repository import LOCAL_MODEL_VERSION

APPROVED_MODELS = {4: "Extra Trees", 8: "Random Forest", 12: "Gradient Boosting"}


class PredictiveService:
    def __init__(self, repository: Any):
        self.repository = repository

    def retrain(self, context: dict[str, str], user: dict[str, Any]) -> dict[str, Any]:
        raise LookupError(
            "Reentrenamiento remoto deshabilitado hasta disponer de almacenamiento de objetos"
        )

    def infer_cu(self, context: dict[str, str], horizon: int, records: list[dict[str, Any]]) -> dict[str, Any]:
        if horizon not in APPROVED_MODELS:
            raise ValueError("Horizonte no soportado")
        active_version = self.repository.get_active_version(context)
        if not active_version or active_version.get("activeVersion") != LOCAL_MODEL_VERSION:
            raise LookupError("La versiÃ³n activa no existe en los artefactos locales")
        active = self.repository.get_active(context, "cu_pls", horizon)
        if not active:
            raise LookupError("No existe un modelo activo")
        if active.get("version") != active_version["activeVersion"]:
            raise LookupError("El modelo activo no coincide con la versiÃ³n activa")
        if active.get("winner") != APPROVED_MODELS[horizon]:
            raise LookupError("El algoritmo activo no coincide con el modelo aprobado")
        artifact = self.repository.download_artifact(active["artifactPath"])
        prediction = predict(artifact, records[-1])
        return {"status": "ok", "prediction": prediction, "unit": "g/L", "recordsUsed": len(records),
                "calculatedAt": datetime.now(timezone.utc).isoformat(), "predictionHorizonHours": horizon,
                "model": {"name": active["winner"], "version": active["version"],
                          "validationStatus": active.get("validationStatus", "approved")},
                "metrics": {"mae": active["mae"], "rmse": active["rmse"], "r2": active["r2"]},
                "horizonData": {"winner": active["winner"], "validationMetrics": active["competition"]}}
