
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "InterviewAI"
    app_description: str = "AI-powered voice interview practice platform"
    app_version: str = "1.0.0"
    environment: str = "development"
    database_url: str
    jwt_secret_key: str
    groq_api_key: str
    groq_model: str = "openai/gpt-oss-20b"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
