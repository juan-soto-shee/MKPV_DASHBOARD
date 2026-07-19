import pytest

from plantview_predictive import service as service_module
from plantview_predictive.repository import FirebaseRepository, LOCAL_MODEL_VERSION
from plantview_predictive.service import PredictiveService

CONTEXT = {"implementationId": "impl_a", "clienteId": "client_a", "profileId": "lixiviacion"}
USER = {"uid": "technical-user"}


class FakeRepository:
    def __init__(self, version=LOCAL_MODEL_VERSION, active=None):
        self.version = version
        self.active = active
        self.downloads = []

    def get_active_version(self, context):
        return {"activeVersion": self.version, "active": True}

    def get_active(self, context, target, horizon):
        return self.active

    def download_artifact(self, path):
        self.downloads.append(path)
        return b"artifact"


def active_model(horizon=4, winner="Extra Trees"):
    return {
        "artifactPath": (
            "plantview-models/client_a/impl_a/lixiviacion/"
            f"{LOCAL_MODEL_VERSION}/cu_pls_{horizon}h.joblib"
        ),
        "winner": winner,
        "version": LOCAL_MODEL_VERSION,
        "validationStatus": "approved",
        "mae": .1,
        "rmse": .2,
        "r2": .9,
        "competition": {winner: {"mae": .1, "rmse": .2, "r2": .9}},
    }


def test_retraining_is_blocked_before_any_repository_write():
    with pytest.raises(LookupError, match="Reentrenamiento remoto deshabilitado"):
        PredictiveService(FakeRepository()).retrain(CONTEXT, USER)


def test_unapproved_horizon_is_never_inferred():
    with pytest.raises(ValueError, match="Horizonte no soportado"):
        PredictiveService(FakeRepository()).infer_cu(CONTEXT, 24, [])


def test_missing_local_active_version_returns_unavailable():
    repository = FakeRepository(version="v-future", active=active_model())
    with pytest.raises(LookupError, match="activa no existe"):
        PredictiveService(repository).infer_cu(CONTEXT, 4, [{}])
    assert repository.downloads == []


def test_approved_model_infers_from_matching_local_version(monkeypatch):
    repository = FakeRepository(active=active_model())
    monkeypatch.setattr(service_module, "predict", lambda artifact, record: 1.234)
    response = PredictiveService(repository).infer_cu(CONTEXT, 4, [{"cuPls": 1.2}])
    assert response["prediction"] == 1.234
    assert response["model"]["version"] == LOCAL_MODEL_VERSION
    assert repository.downloads[0].endswith("cu_pls_4h.joblib")


@pytest.mark.parametrize("horizon", [4, 8, 12])
def test_packaged_models_generate_predictions(horizon):
    repository = FakeRepository(active=active_model(
        horizon=horizon, winner=service_module.APPROVED_MODELS[horizon]
    ))
    repository.download_artifact = lambda path: FirebaseRepository.__new__(
        FirebaseRepository
    ).download_artifact(path)
    record = {
        "timestampCreacion": "2026-07-15T01:00:00Z", "cuPls": 4.1,
        "flujoPLS": 980, "flujoRefino": 770, "acidezRefino": 8.7,
        "nivelPiscinaPLS": 68, "nivelPiscinaRefino": 68,
        "subarea": "Pila 1", "turno": "Turno A",
    }
    response = PredictiveService(repository).infer_cu(CONTEXT, horizon, [record])
    assert response["status"] == "ok"
    assert isinstance(response["prediction"], float)


@pytest.mark.parametrize("horizon", [4, 8, 12])
def test_local_approved_artifacts_are_packaged(horizon):
    path = (
        "plantview-models/client_a/impl_a/lixiviacion/"
        f"{LOCAL_MODEL_VERSION}/cu_pls_{horizon}h.joblib"
    )
    artifact = FirebaseRepository.__new__(FirebaseRepository).download_artifact(path)
    assert artifact.startswith(b"\x80")


@pytest.mark.parametrize("filename", ["cu_pls_24h.joblib", "pool_pls_24h.joblib"])
def test_local_unapproved_artifacts_are_rejected(filename):
    path = f"plantview-models/client/impl/lixiviacion/{LOCAL_MODEL_VERSION}/{filename}"
    with pytest.raises(LookupError, match="aprobado"):
        FirebaseRepository.__new__(FirebaseRepository).download_artifact(path)
