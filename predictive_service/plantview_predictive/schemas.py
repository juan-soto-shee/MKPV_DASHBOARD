from typing import Any
from pydantic import BaseModel, Field


class ModelContext(BaseModel):
    implementationId: str = Field(pattern=r"^[A-Za-z0-9_-]+$")
    clienteId: str = Field(pattern=r"^[A-Za-z0-9_-]+$")
    profileId: str = Field(pattern=r"^[A-Za-z0-9_-]+$")


class PredictionRequest(ModelContext):
    horizonHours: int = Field(default=4)
    records: list[dict[str, Any]] = Field(min_length=1)


class RetrainRequest(ModelContext):
    pass
