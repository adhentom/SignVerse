from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_METADATA_NODES = 256
MAX_METADATA_DEPTH = 6
MAX_METADATA_STRING_LENGTH = 2_000


def _validate_metadata_value(value: Any, depth: int = 0) -> int:
    if depth > MAX_METADATA_DEPTH:
        raise ValueError("metadata exceeds the maximum nesting depth")
    if isinstance(value, str):
        if len(value) > MAX_METADATA_STRING_LENGTH:
            raise ValueError("metadata string exceeds the maximum length")
        return 1
    if isinstance(value, dict):
        nodes = 1
        for key, child in value.items():
            if not isinstance(key, str) or len(key) > 200:
                raise ValueError("metadata keys must be short strings")
            nodes += _validate_metadata_value(child, depth + 1)
        return nodes
    if isinstance(value, list):
        return 1 + sum(_validate_metadata_value(child, depth + 1) for child in value)
    return 1


class ContentPacket(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    platform: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=500)
    speaker: str | None = Field(default=None, max_length=200)
    timestamp: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=50_000)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("metadata")
    @classmethod
    def bound_metadata(cls, value: dict[str, Any]) -> dict[str, Any]:
        if _validate_metadata_value(value) > MAX_METADATA_NODES:
            raise ValueError("metadata contains too many values")
        return value
