from pydantic import BaseModel, Field

from signverse_api.models.playback import PlaybackSequence


class InterpretationResponse(BaseModel):
    summary: str = ""
    malayalam_translation: str = ""
    key_points: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    glossary: list[str] = Field(default_factory=list)
    isl_gloss: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    playback: PlaybackSequence = Field(default_factory=PlaybackSequence)
