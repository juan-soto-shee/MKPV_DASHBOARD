from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PLANTVIEW_", env_file=".env", extra="ignore")
    firebase_project_id: str = "metkinetics-leachview"
    records_collection: str = "leach_records"
    models_collection: str = "prediction_models"
    audits_collection: str = "prediction_model_audits"
    minimum_pairs: int = 500
    allowed_profile_id: str = "lixiviacion"
    cors_allowed_origins: str = "https://juan-soto-shee.github.io,https://metkinetics.cl"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]


settings = Settings()
