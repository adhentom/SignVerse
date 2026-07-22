from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SemanticParticipant(BaseModel):
    """A discourse participant resolved without carrying source-language wording forward."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    referent: str = Field(min_length=1)
    role: str = Field(min_length=1)
    resolution: str = Field(min_length=1)


class PronounResolution(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    pronoun: str = Field(min_length=1)
    referent: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)


class ResolvedExpression(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    expression_type: Literal["idiom", "phrasal-verb", "compound", "discourse-marker"]
    resolved_meaning: str = Field(min_length=1)


class SemanticEmotion(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    label: Literal[
        "neutral",
        "happy",
        "sad",
        "angry",
        "afraid",
        "surprised",
        "concerned",
        "excited",
        "frustrated",
        "other",
    ]
    intensity: float = Field(ge=0.0, le=1.0)
    evidence: str


class ConversationalContext(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    speaker_turn: str = Field(min_length=1)
    discourse_links: list[str]
    fillers_removed: list[str]
    is_fragment: bool
    recovered_meaning: str


class SemanticUnit(BaseModel):
    """A phrase-sized meaning unit used for translation and signed realization."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    unit_id: str = Field(min_length=1, max_length=100)
    normalized_meaning: str = Field(min_length=1, max_length=1_000)
    discourse_function: Literal[
        "topic",
        "comment",
        "question",
        "negation",
        "command",
        "response",
        "transition",
    ]
    predicate: str = ""
    arguments: list[str]
    resolved_referents: list[str]
    temporal_anchor: str = ""
    classifier_candidates: list[str]
    emphasis: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)


class SemanticRepresentation(BaseModel):
    """Validated, language-neutral meaning used by all downstream linguistic outputs."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    normalized_meaning: str = Field(min_length=1)
    intent: str = Field(min_length=1)
    speech_act: Literal[
        "statement",
        "question",
        "request",
        "command",
        "greeting",
        "response",
        "other",
    ]
    discourse_register: Literal["formal", "neutral", "conversational"]
    propositions: list[str]
    semantic_units: list[SemanticUnit] = Field(min_length=1)
    participants: list[SemanticParticipant]
    pronoun_resolutions: list[PronounResolution]
    tense: Literal["past", "present", "future", "mixed", "unspecified"]
    aspect: list[Literal["simple", "progressive", "perfect", "habitual", "completed"]]
    voice: Literal["active", "passive", "mixed", "not-applicable"]
    temporal_context: list[str]
    modality: list[str]
    polarity: Literal["affirmative", "negative", "mixed"]
    emotion: SemanticEmotion
    resolved_expressions: list[ResolvedExpression]
    conversational_context: ConversationalContext
    ambiguities: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


class RealizationConfidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    malayalam_translation: float = Field(ge=0.0, le=1.0)
    isl_gloss: float = Field(ge=0.0, le=1.0)


class InterpretationConfidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    semantic: float = Field(ge=0.0, le=1.0)
    malayalam_translation: float = Field(ge=0.0, le=1.0)
    isl_gloss: float = Field(ge=0.0, le=1.0)

    @property
    def aggregate(self) -> float:
        """Return a conservative compatibility score for the unchanged public field."""

        return min(self.semantic, self.malayalam_translation, self.isl_gloss)
