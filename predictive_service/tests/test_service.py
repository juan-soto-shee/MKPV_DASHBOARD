import pytest

from plantview_predictive import service as service_module
from plantview_predictive.service import PredictiveService

CONTEXT = {"implementationId": "impl_a", "clienteId": "client_a", "profileId": "lixiviacion"}
USER = {"uid": "technical-user"}


class FakeRepository:
    def __init__(self, fail_upload_at=None):
        self.records = [{"timestampCreacion": "2026-01-01T00:00:00Z"}]
        self.uploads = []
        self.activations = []
        self.fail_upload_at = fail_upload_at
        self.active = None

    def read_records(self, context):
        assert context == CONTEXT
        return self.records

    def upload_artifact(self, path, data):
        if self.fail_upload_at == len(self.uploads):
            raise RuntimeError("storage failed")
        self.uploads.append((path, data))

    def activate_all(self, context, version, models, user):
        self.activations.append((context, version, models, user))

    def get_active(self, context, target, horizon):
        return self.active

    def download_artifact(self, path):
        return b"artifact"


def trained(records, target, horizon, minimum):
    return {"artifact": b"model", "winner": "Extra Trees", "mae": .1, "rmse": .2, "r2": .9,
            "recordsUsed": 600, "horizon": horizon, "target": target, "durationSeconds": 1.2,
            "competition": {"Extra Trees": {"mae": .1, "rmse": .2, "r2": .9, "durationSeconds": 1.2}}}


def test_retraining_activates_all_models_once(monkeypatch):
    monkeypatch.setattr(service_module, "train_competition", trained)
    repository = FakeRepository()
    result = PredictiveService(repository).retrain(CONTEXT, USER)
    assert result["status"] == "ok"
    assert len(repository.uploads) == 5
    assert len(repository.activations) == 1
    assert len(repository.activations[0][2]) == 5
    assert all(result["version"] in path for path, _ in repository.uploads)


def test_failure_keeps_previous_version_active(monkeypatch):
    monkeypatch.setattr(service_module, "train_competition", trained)
    repository = FakeRepository(fail_upload_at=2)
    with pytest.raises(RuntimeError, match="storage failed"):
        PredictiveService(repository).retrain(CONTEXT, USER)
    assert repository.activations == []


def test_retraining_generates_new_version(monkeypatch):
    monkeypatch.setattr(service_module, "train_competition", trained)
    versions = iter(["v1", "v2"])
    monkeypatch.setattr(service_module, "new_version", lambda: next(versions))
    repository = FakeRepository()
    first = PredictiveService(repository).retrain(CONTEXT, USER)
    second = PredictiveService(repository).retrain(CONTEXT, USER)
    assert first["version"] != second["version"]
