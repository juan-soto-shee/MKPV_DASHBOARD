import logging

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .auth import authenticated_user, authorize_context
from .config import settings
from .repository import FirebaseRepository
from .schemas import PredictionRequest, RetrainRequest
from .service import PredictiveService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
app = FastAPI(title="MetKinetics PlantView Predictive Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def get_service() -> PredictiveService:
    return PredictiveService(FirebaseRepository())


@app.post("/v1/plantview/predictions/cu-pls")
def cu_pls(request: PredictionRequest, user=Depends(authenticated_user), service=Depends(get_service)):
    context = request.model_dump(include={"implementationId", "clienteId", "profileId"})
    authorize_context(user, context)
    try:
        records = [record.model_dump() for record in request.records]
        return service.infer_cu(context, request.horizonHours, records)
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
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except LookupError as error:
        raise HTTPException(503, str(error)) from error
