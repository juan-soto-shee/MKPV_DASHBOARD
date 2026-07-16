from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query

from .auth import authenticated_user, authorize_context
from .modeling import InsufficientDataError
from .repository import FirebaseRepository
from .schemas import ModelContext, PredictionRequest, RetrainRequest
from .service import PredictiveService

app = FastAPI(title="MetKinetics PlantView Predictive Service", version="1.0.0")


def get_service() -> PredictiveService:
    return PredictiveService(FirebaseRepository())


@app.post("/v1/plantview/predictions/cu-pls")
def cu_pls(request: PredictionRequest, user=Depends(authenticated_user), service=Depends(get_service)):
    context = request.model_dump(include={"implementationId", "clienteId", "profileId"})
    authorize_context(user, context)
    try:
        return service.infer_cu(context, request.horizonHours, request.records)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except LookupError as error:
        raise HTTPException(503, str(error)) from error


@app.get("/v1/plantview/models/status")
def status(implementationId: str, clienteId: str, profileId: str,
           user=Depends(authenticated_user), service=Depends(get_service)):
    context = {"implementationId": implementationId, "clienteId": clienteId, "profileId": profileId}
    authorize_context(user, context)
    return {"status": "ok", "models": service.repository.get_status(context)}


@app.post("/v1/plantview/models/retrain")
def retrain(request: RetrainRequest, user=Depends(authenticated_user), service=Depends(get_service)):
    context = request.model_dump()
    authorize_context(user, context, technical=True)
    try:
        return service.retrain(context, user)
    except InsufficientDataError as error:
        raise HTTPException(422, str(error)) from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
