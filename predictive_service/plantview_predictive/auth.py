from __future__ import annotations

from typing import Annotated, Any

from fastapi import Header, HTTPException
from firebase_admin import auth, firestore

from .repository import initialize_firebase

TECHNICAL_ROLES = {"tecnico", "technical_profile", "metkinetics_admin"}


def authenticated_user(authorization: Annotated[str | None, Header()] = None) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Firebase token requerido")
    initialize_firebase()
    try:
        return auth.verify_id_token(authorization[7:])
    except Exception as error:
        raise HTTPException(status_code=401, detail="Firebase token inválido") from error


def authorize_context(user: dict[str, Any], context: dict[str, str], technical: bool = False) -> None:
    db = firestore.client()
    admin = None
    if user.get("email"):
        snap = db.collection("admin_users").document(user["email"].lower()).get()
        admin = snap.to_dict() if snap.exists else None
    snap = db.collection("user_access").document(user["uid"]).get()
    access = snap.to_dict() if snap.exists else None
    authorization = admin if admin and admin.get("activo") is True else access
    allowed = authorization and authorization.get("activo") is True
    if allowed and authorization is access:
        allowed = context["clienteId"] in authorization.get("clienteIds", [])
    if technical:
        allowed = allowed and authorization.get("rol") in TECHNICAL_ROLES
    if not allowed:
        raise HTTPException(status_code=403, detail="Acceso no autorizado para esta implementación")
    for field in ("implementationId", "clienteId", "profileId"):
        explicit = authorization.get(field)
        if explicit and explicit != context[field]:
            raise HTTPException(status_code=403, detail=f"{field} no autorizado")
