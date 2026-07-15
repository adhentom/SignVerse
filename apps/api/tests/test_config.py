import pytest
from pydantic import ValidationError

from signverse_api.config import Settings


def test_settings_reject_wildcard_cors() -> None:
    with pytest.raises(ValidationError, match="Wildcard CORS origins"):
        Settings(cors_origins=["*"])


def test_openai_api_key_is_loaded_from_standard_environment_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-from-environment")

    settings = Settings()

    assert settings.openai_api_key is not None
    assert settings.openai_api_key.get_secret_value() == "test-key-from-environment"
    assert "test-key-from-environment" not in repr(settings)
