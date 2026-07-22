from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

GlossRole = Literal[
    "time",
    "topic",
    "referent",
    "classifier",
    "location",
    "object",
    "predicate",
    "aspect",
    "modality",
    "negation",
    "question",
    "discourse",
]
NonManualType = Literal[
    "brow-raise",
    "brow-lower",
    "head-shake",
    "head-nod",
    "head-tilt",
    "eye-gaze",
    "mouth-gesture",
    "body-shift",
    "facial-emotion",
]


class NonManualMarker(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    marker: NonManualType
    value: str = ""
    scope: Literal["token", "phrase"]
    timing: Literal["before", "throughout", "after"]
    intensity: float = Field(ge=0.0, le=1.0)


class ISLGlossUnit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    gloss: str = Field(min_length=1, max_length=200)
    role: GlossRole
    referent: str = ""
    classifier: str = ""
    emphasis: float = Field(default=0.0, ge=0.0, le=1.0)
    non_manual_markers: list[NonManualMarker] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


class ISLPhraseSegment(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    segment_id: str = Field(min_length=1, max_length=100)
    meaning: str = Field(min_length=1, max_length=1_000)
    discourse_function: Literal[
        "topic",
        "comment",
        "question",
        "negation",
        "command",
        "response",
        "transition",
    ]
    glosses: list[ISLGlossUnit] = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)


class InterpretationQuality(BaseModel):
    model_config = ConfigDict(extra="forbid")

    semantic_accuracy: float = Field(ge=0.0, le=1.0)
    malayalam_translation: float = Field(ge=0.0, le=1.0)
    gloss_correctness: float = Field(ge=0.0, le=1.0)
    asset_matching: float | None = Field(default=None, ge=0.0, le=1.0)
    animation_readiness: float | None = Field(default=None, ge=0.0, le=1.0)
    avatar_confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class InterpretationDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_text: str
    semantic_representation: dict[str, object]
    phrase_segments: list[ISLPhraseSegment]
    matched_assets: list[str] = Field(default_factory=list)
    missing_glosses: list[str] = Field(default_factory=list)
    playback_timeline: list[dict[str, object]] = Field(default_factory=list)
