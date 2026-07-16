"""Inventario read-only de los artefactos joblib heredados en Firestore."""

from __future__ import annotations

import json

import firebase_admin
from firebase_admin import firestore

from plantview_predictive.config import settings

LEGACY_ARTIFACTS_COLLECTION = "prediction_model_artifacts"


def audit() -> dict:
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})
    documents = {
        snapshot.id: snapshot.to_dict()
        for snapshot in firestore.client().collection(LEGACY_ARTIFACTS_COLLECTION).stream()
    }
    manifests = {
        document_id: payload
        for document_id, payload in documents.items()
        if "path" in payload and "chunks" in payload and "size" in payload
    }
    fragments = {
        document_id: payload
        for document_id, payload in documents.items()
        if "data" in payload and "index" in payload
    }
    expected_fragment_ids = {
        f"{artifact_id}__{index:04d}"
        for artifact_id, manifest in manifests.items()
        for index in range(manifest["chunks"])
    }
    return {
        "collection": LEGACY_ARTIFACTS_COLLECTION,
        "readOnly": True,
        "manifests": len(manifests),
        "fragments": len(fragments),
        "totalDocuments": len(documents),
        "logicalPaths": sorted(manifest["path"] for manifest in manifests.values()),
        "totalArtifactBytes": sum(manifest["size"] for manifest in manifests.values()),
        "missingFragments": sorted(expected_fragment_ids - fragments.keys()),
        "unreferencedFragments": sorted(fragments.keys() - expected_fragment_ids),
        "orphanDocumentIds": sorted(documents.keys()),
    }


if __name__ == "__main__":
    print(json.dumps(audit(), ensure_ascii=False, indent=2))
