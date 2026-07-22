from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="SIGNVERSE_",
        extra="ignore",
        populate_by_name=True,
    )

    environment: Literal["development", "test", "staging", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    docs_enabled: bool = True
    interpretation_provider: Literal["mock", "openai"] = "mock"
    openai_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_API_KEY", "SIGNVERSE_OPENAI_API_KEY"),
    )
    openai_model: str = "gpt-5.4-mini"
    openai_semantic_model: str | None = None
    openai_realization_model: str | None = None
    openai_timeout_seconds: float = Field(default=8.0, gt=0, le=120)
    openai_max_output_tokens: int = Field(default=1_500, ge=256, le=8_000)
    openai_transcription_model: str = "gpt-4o-mini-transcribe"
    openai_transcription_timeout_seconds: float = Field(default=20.0, gt=0, le=120)
    openai_semantic_cache_size: int = Field(default=256, ge=0, le=10_000)
    minimum_semantic_confidence: float = Field(default=0.55, ge=0.0, le=1.0)
    minimum_malayalam_confidence: float = Field(default=0.55, ge=0.0, le=1.0)
    minimum_gloss_confidence: float = Field(default=0.65, ge=0.0, le=1.0)
    minimum_asset_match_confidence: float = Field(default=0.55, ge=0.0, le=1.0)

    @field_validator("cors_origins")
    @classmethod
    def reject_wildcard_origin(cls, origins: list[str]) -> list[str]:
        if "*" in origins:
            raise ValueError("Wildcard CORS origins are not allowed with credentials")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
