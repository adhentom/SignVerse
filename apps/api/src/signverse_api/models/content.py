from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ContentPacket(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    platform: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=500)
    speaker: str | None = Field(default=None, max_length=200)
    timestamp: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=50_000)
    metadata: dict[str, Any] = Field(default_factory=dict)
