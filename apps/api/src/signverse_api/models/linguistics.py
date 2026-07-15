from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ISLTokenCategory = Literal[
    "lexical",
    "classifier",
    "fingerspelling",
    "number",
    "date",
    "proper-noun",
    "unknown",
]
LexiconReviewStatus = Literal["draft", "in-review", "approved", "deprecated", "rejected"]


class ISLToken(BaseModel):
    """A versioned semantic unit in the governed ISL representation."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=200)
    concept: str = Field(min_length=1, max_length=500)
    gloss: str = Field(min_length=1, max_length=500)
    confidence: float = Field(ge=0.0, le=1.0)
    category: ISLTokenCategory
    language: str = Field(min_length=2, max_length=35)
    region: str | None = Field(default=None, max_length=100)
    version: str = Field(min_length=1, max_length=64)


class LexiconEntry(BaseModel):
    """Governance metadata for a token admitted to a lexicon provider."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    token_id: str = Field(min_length=1, max_length=200)
    source: str = Field(min_length=1, max_length=2_000)
    license: str = Field(min_length=1, max_length=500)
    review_status: LexiconReviewStatus
    created_at: datetime
    updated_at: datetime


class InterpretationGloss(BaseModel):
    """An ordered, governed sequence of ISL tokens."""

    model_config = ConfigDict(extra="forbid")

    tokens: list[ISLToken] = Field(default_factory=list)
