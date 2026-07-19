from fastapi.testclient import TestClient
from fastapi import HTTPException
import pytest

from plantview_predictive import auth as auth_module
from plantview_predictive.auth import authorize_context
from plantview_predictive.main import app


def test_github_pages_preflight_is_allowed():
    response = TestClient(app).options(
        "/v1/plantview/predictions/cu-pls",
        headers={
            "Origin": "https://juan-soto-shee.github.io",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://juan-soto-shee.github.io"
    assert "POST" in response.headers["access-control-allow-methods"]


def test_untrusted_origin_preflight_is_rejected():
    response = TestClient(app).options(
        "/v1/plantview/predictions/cu-pls",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_production_domain_preflight_is_allowed():
    response = TestClient(app).options(
        "/v1/plantview/predictions/cu-pls",
        headers={
            "Origin": "https://metkinetics.cl",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://metkinetics.cl"


def test_prediction_requires_firebase_token():
    response = TestClient(app).post("/v1/plantview/predictions/cu-pls", json={
        "implementationId": "impl_a", "clienteId": "client_a", "profileId": "lixiviacion",
        "horizonHours": 4, "records": [{
            "timestampCreacion": "2026-01-01T00:00:00Z", "cuPls": 2.5,
            "flujoPLS": 80, "flujoRefino": 50, "acidezRefino": 16,
            "nivelPiscinaPLS": 55, "nivelPiscinaRefino": 62,
            "subarea": "Pila 1", "turno": "Turno A",
        }],
    })
    assert response.status_code == 401


def test_retrain_requires_firebase_token():
    response = TestClient(app).post("/v1/plantview/models/retrain", json={
        "implementationId": "impl_a", "clienteId": "client_a", "profileId": "lixiviacion",
    })
    assert response.status_code == 401


class Snapshot:
    def __init__(self, data=None):
        self._data = data
        self.exists = data is not None
    def to_dict(self):
        return self._data


class Document:
    def __init__(self, data):
        self.data = data
    def get(self):
        return Snapshot(self.data)


class Collection:
    def __init__(self, values):
        self.values = values
    def document(self, key):
        return Document(self.values.get(key))


class Database:
    def collection(self, name):
        values = {"user_access": {"user-a": {"activo": True, "rol": "technical_profile",
                                                "clienteIds": ["client_a"], "implementationId": "impl_a",
                                                "profileId": "lixiviacion"}}, "admin_users": {}}
        return Collection(values[name])


def test_authentication_blocks_cross_client_training(monkeypatch):
    monkeypatch.setattr(auth_module.firestore, "client", lambda: Database())
    with pytest.raises(HTTPException) as error:
        authorize_context({"uid": "user-a"}, {"clienteId": "client_b", "implementationId": "impl_b",
                                                    "profileId": "lixiviacion"}, technical=True)
    assert error.value.status_code == 403
