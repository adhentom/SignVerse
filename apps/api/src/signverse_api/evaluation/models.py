from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SemanticExpectation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    intent: str = Field(min_length=1)
    speech_act: str = Field(min_length=1)
    tense: str = Field(min_length=1)
    aspect: list[str]
    modality: list[str]
    polarity: str = Field(min_length=1)
    emotion: str = Field(min_length=1)
    voice: str = Field(min_length=1)


class BenchmarkCase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(min_length=1)
    category: str = Field(min_length=1)
    platform: Literal["website", "youtube", "google-meet"]
    source: str = Field(min_length=1)
    context: list[str]
    expected_semantics: SemanticExpectation
    expected_malayalam_translation: str = Field(min_length=1)
    expected_isl_gloss: list[str] = Field(min_length=1)
    review_status: Literal["candidate-native-review-required", "native-reviewed"]
    metadata: dict[str, bool]


class BenchmarkPrediction(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(min_length=1)
    semantics: SemanticExpectation
    malayalam_translation: str
    isl_gloss: list[str]
    latency_ms: float | None = Field(default=None, ge=0.0)
    avatar_continuity: float | None = Field(default=None, ge=0.0, le=1.0)


class EvaluationReport(BaseModel):
    total_cases: int = Field(ge=0)
    evaluated_cases: int = Field(ge=0)
    native_reviewed_cases: int = Field(ge=0)
    semantic_accuracy: float = Field(ge=0.0, le=1.0)
    translation_similarity: float = Field(ge=0.0, le=1.0)
    malayalam_fluency_proxy: float = Field(ge=0.0, le=1.0)
    gloss_correctness: float = Field(ge=0.0, le=1.0)
    exact_gloss_rate: float = Field(ge=0.0, le=1.0)
    asset_coverage: float = Field(ge=0.0, le=1.0)
    animation_readiness: float = Field(ge=0.0, le=1.0)
    avatar_continuity: float = Field(ge=0.0, le=1.0)
    latency_mean_ms: float = Field(ge=0.0)
    latency_p95_ms: float = Field(ge=0.0)
    missing_prediction_ids: list[str]
    notes: list[str]
