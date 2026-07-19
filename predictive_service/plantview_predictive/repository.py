from __future__ import annotations

from datetime import datetime, timezone
import logging
from pathlib import Path, PurePosixPath
from typing import Any

import firebase_admin
from firebase_admin import firestore

from .config import settings

logger = logging.getLogger(__name__)

LOCAL_MODEL_VERSION = "v20260716T195727256557Z"
LOCAL_ARTIFACTS = {
    4: "cu_pls_4h.joblib",
    8: "cu_pls_8h.joblib",
    12: "cu_pls_12h.joblib",
}
LOCAL_ARTIFACT_DIR = (
    Path(__file__).resolve().parents[1] / "artifacts" / "candidates" / LOCAL_MODEL_VERSION
)


def initialize_firebase() -> None:
    if firebase_admin._apps:
        return
    firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})


class FirebaseRepository:
    def __init__(self) -> None:
        initialize_firebase()
        self.db = firestore.client()

    def read_records(self, context: dict[str, str]) -> list[dict[str, Any]]:
        if settings.records_collection != "leach_records":
            raise RuntimeError("El entrenamiento sólo admite la colección leach_records")
        query = (self.db.collection(settings.records_collection)
                 .where("clienteId", "==", context["clienteId"])
                 .where("implementationId", "==", context["implementationId"])
                 .where("profileId", "==", context["profileId"]))
        logger.info(
            "FIRESTORE project=%s collection=%s query=clienteId==%s AND implementationId==%s AND profileId==%s",
            settings.firebase_project_id, settings.records_collection, context["clienteId"],
            context["implementationId"], context["profileId"],
        )
        records = [{"id": item.id, **item.to_dict()} for item in query.stream()]
        logger.info("FIRESTORE documents=%d", len(records))
        return records

    def upload_artifact(self, path: str, data: bytes) -> None:
        raise RuntimeError(
            "Carga remota de artefactos deshabilitada; conserve el candidato local"
        )

    def download_artifact(self, path: str) -> bytes:
        logical_path = PurePosixPath(path)
        if LOCAL_MODEL_VERSION not in logical_path.parts:
            raise LookupError("La versiÃ³n activa no existe en los artefactos locales")
        allowed_name = logical_path.name in LOCAL_ARTIFACTS.values()
        if not allowed_name:
            raise LookupError("El artefacto solicitado no estÃ¡ aprobado para inferencia")
        artifact_path = LOCAL_ARTIFACT_DIR / logical_path.name
        if not artifact_path.is_file():
            raise LookupError("La versiÃ³n activa no existe en los artefactos locales")
        logger.info(
            "MODELO artifact_loaded=true version=%s logical_path=%s local_path=%s",
            LOCAL_MODEL_VERSION, path, artifact_path,
        )
        return artifact_path.read_bytes()

    def get_active_version(self, context: dict[str, str]) -> dict[str, Any] | None:
        snapshot = self.db.collection(settings.models_collection).document(
            self._version_key(context)
        ).get()
        return snapshot.to_dict() if snapshot.exists else None

    def get_active(self, context: dict[str, str], target: str, horizon: int) -> dict[str, Any] | None:
        snapshot = self.db.collection(settings.models_collection).document(
            self._model_key(context, target, horizon)
        ).get()
        model = snapshot.to_dict() if snapshot.exists else None
        return model if model and model.get("active") is True else None

    def get_status(self, context: dict[str, str]) -> list[dict[str, Any]]:
        prefix = f'{context["clienteId"]}__{context["implementationId"]}__{context["profileId"]}__'
        return [item.to_dict() for item in self.db.collection(settings.models_collection).stream()
                if item.id.startswith(prefix)]

    def activate_all(self, context: dict[str, str], version: str, models: list[dict[str, Any]], user: dict[str, Any]) -> None:
        """Publish atomically; a failed commit leaves the previous version untouched."""
        batch = self.db.batch()
        activated_at = datetime.now(timezone.utc)
        approved_keys = {(model["target"], model["horizon"]) for model in models}
        if approved_keys != {("cu_pls", 4), ("cu_pls", 8), ("cu_pls", 12)}:
            raise ValueError("La activaciÃ³n requiere exactamente los tres modelos aprobados")
        for model in models:
            payload = {key: value for key, value in model.items() if key != "artifact"}
            payload.update({**context, "version": version, "active": True,
                            "activatedAt": activated_at, "activatedBy": user["uid"]})
            ref = self.db.collection(settings.models_collection).document(
                self._model_key(context, model["target"], model["horizon"])
            )
            batch.set(ref, payload)
            audit = self.db.collection(settings.audits_collection).document()
            batch.set(audit, {**payload, "user": user["uid"], "date": activated_at})
        for target, horizon, status in (("cu_pls", 24, "experimental"),
                                        ("pool_pls", 24, "rejected")):
            ref = self.db.collection(settings.models_collection).document(
                self._model_key(context, target, horizon)
            )
            batch.set(ref, {**context, "target": target, "horizon": horizon, "active": False,
                            "validationStatus": status, "updatedAt": activated_at}, merge=True)
        version_ref = self.db.collection(settings.models_collection).document(
            self._version_key(context)
        )
        batch.set(version_ref, {**context, "activeVersion": version, "active": True,
                                "activatedAt": activated_at, "activatedBy": user["uid"],
                                "models": [f'cu_pls_{horizon}h' for horizon in (4, 8, 12)]})
        batch.commit()

    @staticmethod
    def _model_key(context: dict[str, str], target: str, horizon: int) -> str:
        return "__".join([context["clienteId"], context["implementationId"], context["profileId"], target, str(horizon)])

    @staticmethod
    def _version_key(context: dict[str, str]) -> str:
        return "__".join([context["clienteId"], context["implementationId"],
                           context["profileId"], "active_version"])
