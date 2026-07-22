from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class ModelContext(BaseModel):
    implementationId: str = Field(pattern=r"^[A-Za-z0-9_-]+$")
    clienteId: str = Field(pattern=r"^[A-Za-z0-9_-]+$")
    profileId: str = Field(pattern=r"^[A-Za-z0-9_-]+$")


class OperationalRecord(BaseModel):
    timestampCreacion: datetime | int | float | str
    cuPls: float
    flujoPLS: float
    flujoRefino: float
    acidezRefino: float
    nivelPiscinaPLS: float
    nivelPiscinaRefino: float
    subarea: str = Field(min_length=1)
    turno: str = Field(min_length=1)


class PredictionRequest(ModelContext):
    horizonHours: int = Field(default=4)
    predictionMode: str = Field(default="normal", pattern=r"^(normal|demo)$")
    sessionId: str | None = None
    records: list[OperationalRecord] = Field(min_length=1)


class RetrainRequest(ModelContext):
    pass
