from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PLANTVIEW_", env_file=".env", extra="ignore")
    firebase_project_id: str = "metkinetics-leachview"
    storage_bucket: str = "metkinetics-leachview.firebasestorage.app"
    records_collection: str = "leach_records"
    models_collection: str = "prediction_models"
    audits_collection: str = "prediction_model_audits"
    minimum_pairs: int = 500
    allowed_profile_id: str = "lixiviacion"


settings = Settings()
