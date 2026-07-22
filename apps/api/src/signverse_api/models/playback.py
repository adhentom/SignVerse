from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from signverse_api.models.isl_plan import NonManualMarker
from signverse_api.models.linguistics import LexiconReviewStatus

AnimationType = Literal["placeholder", "gif", "mp4", "lottie", "glb", "vrm"]
LicenseStatus = Literal["approved", "conditional", "pending", "blocked"]


class SignAssetMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    token_id: str = Field(min_length=1, max_length=200)
    asset_id: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=500)
    category: str = Field(min_length=1, max_length=100)
    review_status: LexiconReviewStatus
    animation_type: AnimationType
    canonical_gloss: str = ""
    word: str = ""
    synonyms: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    alternate_spellings: list[str] = Field(default_factory=list)
    language: str = "ISL"
    region: str = "India"
    license: str = "pending-review"
    license_status: LicenseStatus = "pending"
    source_id: str = ""
    source_url: str = ""
    attribution: str = ""
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)
    animation_available: bool = False
    animation_clip: str = ""
    media_sha256: str = ""
    duration: float = Field(default=1.2, gt=0.0, le=60.0)
    version: str = Field(min_length=1, max_length=64)


class PlaybackItem(BaseModel):
    token_id: str
    asset_id: str
    duration: float = Field(gt=0.0, le=60.0)
    confidence: float = Field(ge=0.0, le=1.0)
    priority: int = Field(default=0, ge=-100, le=100)
    phrase_id: str | None = None
    source_gloss: str | None = None
    transition_ms: int | None = Field(default=None, ge=0, le=1_000)
    non_manual_markers: list[NonManualMarker] | None = None
    animation_ready: bool | None = None


PlaybackMissReason = Literal[
    "unknown-gloss",
    "lexicon-token-without-asset",
    "asset-unavailable",
]


class PlaybackMiss(BaseModel):
    token: str
    normalized_token: str
    reason: PlaybackMissReason
    detail: str


class PlaybackSequence(BaseModel):
    items: list[PlaybackItem] = Field(default_factory=list)
    unsupported_tokens: list[str] = Field(default_factory=list)
    missing: list[PlaybackMiss] = Field(default_factory=list)
