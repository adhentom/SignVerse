from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from signverse_api.models.linguistics import LexiconReviewStatus

AnimationType = Literal["placeholder", "gif", "mp4", "lottie", "glb", "vrm"]


class SignAssetMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    token_id: str = Field(min_length=1, max_length=200)
    asset_id: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=500)
    category: str = Field(min_length=1, max_length=100)
    review_status: LexiconReviewStatus
    animation_type: AnimationType
    version: str = Field(min_length=1, max_length=64)


class PlaybackItem(BaseModel):
    token_id: str
    asset_id: str
    duration: float = Field(gt=0.0, le=60.0)
    confidence: float = Field(ge=0.0, le=1.0)


class PlaybackSequence(BaseModel):
    items: list[PlaybackItem] = Field(default_factory=list)
    unsupported_tokens: list[str] = Field(default_factory=list)
