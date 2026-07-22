from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse


class StreamRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["content", "reset"]
    sequence: int = Field(ge=0)
    session_id: str = Field(min_length=1, max_length=128)
    packet: ContentPacket | None = None

    @model_validator(mode="after")
    def require_content_packet(self) -> "StreamRequest":
        if self.type == "content" and self.packet is None:
            raise ValueError("Content stream messages require a packet")
        if self.type == "reset" and self.packet is not None:
            raise ValueError("Reset stream messages cannot include a packet")
        return self


class StreamInterpretation(BaseModel):
    type: Literal["interpretation"] = "interpretation"
    sequence: int
    session_id: str
    data: InterpretationResponse


class StreamReset(BaseModel):
    type: Literal["reset"] = "reset"
    sequence: int
    session_id: str


class StreamError(BaseModel):
    type: Literal["error"] = "error"
    sequence: int = 0
    session_id: str = "unknown"
    code: Literal["invalid-message", "interpretation-failed"]
    message: str
