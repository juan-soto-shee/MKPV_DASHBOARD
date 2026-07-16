from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore, storage

from .config import settings


def initialize_firebase() -> None:
    if firebase_admin._apps:
        return
    firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id,
                                           "storageBucket": settings.storage_bucket})


class FirebaseRepository:
    def __init__(self) -> None:
        initialize_firebase()
        self.db = firestore.client()
        self.bucket = storage.bucket()

    def read_records(self, context: dict[str, str]) -> list[dict[str, Any]]:
        if settings.records_collection != "leach_records":
            raise RuntimeError("El entrenamiento sólo admite la colección leach_records")
        query = (self.db.collection(settings.records_collection)
                 .where("clienteId", "==", context["clienteId"])
                 .where("implementationId", "==", context["implementationId"])
                 .where("profileId", "==", context["profileId"]))
        return [{"id": item.id, **item.to_dict()} for item in query.stream()]

    def upload_artifact(self, path: str, data: bytes) -> None:
        blob = self.bucket.blob(path)
        blob.upload_from_string(data, content_type="application/octet-stream", if_generation_match=0)

    def download_artifact(self, path: str) -> bytes:
        return self.bucket.blob(path).download_as_bytes()

    def get_active(self, context: dict[str, str], target: str, horizon: int) -> dict[str, Any] | None:
        snapshot = self.db.collection(settings.models_collection).document(
            self._model_key(context, target, horizon)
        ).get()
        return snapshot.to_dict() if snapshot.exists else None

    def get_status(self, context: dict[str, str]) -> list[dict[str, Any]]:
        prefix = f'{context["clienteId"]}__{context["implementationId"]}__{context["profileId"]}__'
        return [item.to_dict() for item in self.db.collection(settings.models_collection).stream()
                if item.id.startswith(prefix)]

    def activate_all(self, context: dict[str, str], version: str, models: list[dict[str, Any]], user: dict[str, Any]) -> None:
        batch = self.db.batch()
        activated_at = datetime.now(timezone.utc)
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
        batch.commit()

    @staticmethod
    def _model_key(context: dict[str, str], target: str, horizon: int) -> str:
        return "__".join([context["clienteId"], context["implementationId"], context["profileId"], target, str(horizon)])
