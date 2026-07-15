from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from signverse_api.models.linguistics import ISLToken, LexiconReviewStatus

LexiconCategory = Literal[
    "Greetings",
    "Education",
    "Technology",
    "Government",
    "Healthcare",
    "Numbers",
    "Time",
    "Actions",
    "People",
    "Objects",
]


class GovernedLexiconEntry(BaseModel):
    """A local lexicon record with linguistic and governance metadata."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    token_id: str = Field(min_length=1, max_length=200)
    concept: str = Field(min_length=1, max_length=500)
    gloss: str = Field(min_length=1, max_length=500)
    category: LexiconCategory
    language: str = Field(min_length=2, max_length=35)
    region: str = Field(min_length=1, max_length=100)
    version: str = Field(min_length=1, max_length=64)
    review_status: LexiconReviewStatus
    source: str = Field(max_length=2_000)
    license: str = Field(max_length=500)
    synonyms: list[str] = Field(default_factory=list)
    related_tokens: list[str] = Field(default_factory=list)

    def to_token(self, *, confidence: float = 0.0) -> ISLToken:
        return ISLToken(
            id=self.token_id,
            concept=self.concept,
            gloss=self.gloss,
            confidence=confidence,
            category="number" if self.category == "Numbers" else "lexical",
            language=self.language,
            region=self.region,
            version=self.version,
        )


class LexiconDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str = Field(min_length=1, max_length=64)
    entries: list[GovernedLexiconEntry]


class LexiconHealth(BaseModel):
    status: Literal["healthy"] = "healthy"
    version: str
    total_tokens: int = Field(ge=0)
    categories: int = Field(ge=0)


class ConfidenceAdjustment(BaseModel):
    token_id: str
    original_confidence: float = Field(ge=0.0, le=1.0)
    adjusted_confidence: float = Field(ge=0.0, le=1.0)
    reason: Literal["approved", "pending-review", "unsupported"]


class CategoryCoverage(BaseModel):
    total: int = Field(ge=0)
    supported: int = Field(ge=0)
    unsupported: int = Field(ge=0)


class GlossValidationStatistics(BaseModel):
    total_tokens: int = Field(ge=0)
    supported_tokens: int = Field(ge=0)
    unsupported_tokens: int = Field(ge=0)
    category_coverage: dict[str, CategoryCoverage]


class GlossValidationResult(BaseModel):
    supported_tokens: list[ISLToken]
    unsupported_tokens: list[ISLToken]
    confidence_adjustments: list[ConfidenceAdjustment]
    statistics: GlossValidationStatistics
