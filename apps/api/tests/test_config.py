import pytest
from pydantic import ValidationError

from signverse_api.config import Settings


def test_settings_reject_wildcard_cors() -> None:
    with pytest.raises(ValidationError, match="Wildcard CORS origins"):
        Settings(cors_origins=["*"])
