import json
import logging
from collections import OrderedDict
from collections.abc import Awaitable
from hashlib import sha256
from typing import Any, Protocol

from openai import APIError, APITimeoutError, AsyncOpenAI, RateLimitError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse
from signverse_api.models.isl_plan import (
    InterpretationDiagnostics,
    InterpretationQuality,
    ISLPhraseSegment,
)
from signverse_api.models.semantics import (
    InterpretationConfidence,
    RealizationConfidence,
    SemanticRepresentation,
)
from signverse_api.prompts.isl_interpretation import (
    SEMANTIC_ANALYSIS_SYSTEM_PROMPT,
    SIGNVERSE_ISL_SYSTEM_PROMPT,
)
from signverse_api.providers.errors import (
    InvalidProviderResponseError,
    ProviderAPIError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)

logger = logging.getLogger(__name__)

NON_SIGN_GLOSS_LABELS = {
    "CONTENT",
    "CONCEPT",
    "LANGUAGE-LABEL",
    "PHRASE",
    "PLACEHOLDER",
    "SPEAKER-LABEL",
    "TOPIC-LABEL",
    "UNKNOWN",
    "UTTERANCE",
}


def _is_actionable_gloss(gloss: str) -> bool:
    normalized = "-".join(gloss.strip().upper().replace("_", "-").split())
    return any(character.isalnum() for character in normalized) and (
        normalized not in NON_SIGN_GLOSS_LABELS
    )


def _make_openai_strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Require every declared object property as mandated by Responses strict mode."""
    if schema.get("type") == "object" and isinstance(schema.get("properties"), dict):
        properties = schema["properties"]
        schema["required"] = list(properties)
        schema["additionalProperties"] = False
        for value in properties.values():
            if isinstance(value, dict):
                _make_openai_strict_schema(value)

    items = schema.get("items")
    if isinstance(items, dict):
        _make_openai_strict_schema(items)

    definitions = schema.get("$defs")
    if isinstance(definitions, dict):
        for definition in definitions.values():
            if isinstance(definition, dict):
                _make_openai_strict_schema(definition)
    return schema


SEMANTIC_REPRESENTATION_JSON_SCHEMA: dict[str, Any] = _make_openai_strict_schema(
    SemanticRepresentation.model_json_schema()
)


INTERPRETATION_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "malayalam_translation": {"type": "string"},
        "key_points": {"type": "array", "items": {"type": "string"}},
        "keywords": {"type": "array", "items": {"type": "string"}},
        "glossary": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "term": {"type": "string"},
                    "definition": {"type": "string"},
                },
                "required": ["term", "definition"],
            },
        },
        "isl_segments": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "segment_id": {"type": "string"},
                    "meaning": {"type": "string"},
                    "discourse_function": {
                        "type": "string",
                        "enum": [
                            "topic",
                            "comment",
                            "question",
                            "negation",
                            "command",
                            "response",
                            "transition",
                        ],
                    },
                    "glosses": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "gloss": {"type": "string"},
                                "role": {
                                    "type": "string",
                                    "enum": [
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
                                    ],
                                },
                                "referent": {"type": "string"},
                                "classifier": {"type": "string"},
                                "emphasis": {"type": "number", "minimum": 0, "maximum": 1},
                                "non_manual_markers": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "marker": {
                                                "type": "string",
                                                "enum": [
                                                    "brow-raise",
                                                    "brow-lower",
                                                    "head-shake",
                                                    "head-nod",
                                                    "head-tilt",
                                                    "eye-gaze",
                                                    "mouth-gesture",
                                                    "body-shift",
                                                    "facial-emotion",
                                                ],
                                            },
                                            "value": {"type": "string"},
                                            "scope": {
                                                "type": "string",
                                                "enum": ["token", "phrase"],
                                            },
                                            "timing": {
                                                "type": "string",
                                                "enum": ["before", "throughout", "after"],
                                            },
                                            "intensity": {
                                                "type": "number",
                                                "minimum": 0,
                                                "maximum": 1,
                                            },
                                        },
                                        "required": [
                                            "marker",
                                            "value",
                                            "scope",
                                            "timing",
                                            "intensity",
                                        ],
                                    },
                                },
                                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                            },
                            "required": [
                                "gloss",
                                "role",
                                "referent",
                                "classifier",
                                "emphasis",
                                "non_manual_markers",
                                "confidence",
                            ],
                        },
                    },
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": [
                    "segment_id",
                    "meaning",
                    "discourse_function",
                    "glosses",
                    "confidence",
                ],
            },
        },
        "confidence": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "malayalam_translation": {"type": "number", "minimum": 0, "maximum": 1},
                "isl_gloss": {"type": "number", "minimum": 0, "maximum": 1},
            },
            "required": ["malayalam_translation", "isl_gloss"],
        },
    },
    "required": [
        "summary",
        "malayalam_translation",
        "key_points",
        "keywords",
        "glossary",
        "isl_segments",
        "confidence",
    ],
}


class GlossaryEntry(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    term: str = Field(min_length=1)
    definition: str = Field(min_length=1)


class OpenAIInterpretationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    summary: str
    malayalam_translation: str
    key_points: list[str]
    keywords: list[str]
    glossary: list[GlossaryEntry]
    isl_segments: list[ISLPhraseSegment]
    confidence: RealizationConfidence

    def to_api_response(
        self,
        semantic_confidence: float,
        minimum_malayalam_confidence: float,
        minimum_gloss_confidence: float,
        semantic: SemanticRepresentation,
        source_text: str,
        include_diagnostics: bool,
    ) -> InterpretationResponse:
        confidence = InterpretationConfidence(
            semantic=semantic_confidence,
            malayalam_translation=self.confidence.malayalam_translation,
            isl_gloss=self.confidence.isl_gloss,
        )
        gloss_allowed = confidence.isl_gloss >= minimum_gloss_confidence
        segments: list[ISLPhraseSegment] = []
        if gloss_allowed:
            for segment in self.isl_segments:
                actionable = [unit for unit in segment.glosses if _is_actionable_gloss(unit.gloss)]
                rejected = [unit.gloss for unit in segment.glosses if unit not in actionable]
                if rejected:
                    logger.warning(
                        "non_actionable_isl_gloss_rejected",
                        extra={"segment_id": segment.segment_id, "glosses": rejected},
                    )
                if actionable:
                    segments.append(segment.model_copy(update={"glosses": actionable}))
        glosses = [unit.gloss for segment in segments for unit in segment.glosses]
        quality = InterpretationQuality(
            semantic_accuracy=confidence.semantic,
            malayalam_translation=confidence.malayalam_translation,
            gloss_correctness=confidence.isl_gloss,
        )
        diagnostics = (
            InterpretationDiagnostics(
                source_text=source_text,
                semantic_representation=semantic.model_dump(mode="json"),
                phrase_segments=segments,
            )
            if include_diagnostics
            else None
        )
        return InterpretationResponse(
            summary=self.summary,
            malayalam_translation=(
                self.malayalam_translation
                if confidence.malayalam_translation >= minimum_malayalam_confidence
                else ""
            ),
            key_points=self.key_points,
            keywords=self.keywords,
            glossary=[f"{entry.term}: {entry.definition}" for entry in self.glossary],
            isl_gloss=glosses,
            confidence=confidence.aggregate,
            isl_segments=segments,
            quality=quality,
            diagnostics=diagnostics,
        )


class ResponseLike(Protocol):
    output_text: str


class ResponsesResource(Protocol):
    def create(self, **kwargs: Any) -> Awaitable[ResponseLike]: ...


class OpenAIClient(Protocol):
    @property
    def responses(self) -> ResponsesResource: ...

    async def close(self) -> None: ...


class OpenAIInterpretationProvider:
    name = "openai"

    def __init__(
        self,
        client: OpenAIClient,
        model: str,
        max_output_tokens: int,
        *,
        semantic_model: str | None = None,
        realization_model: str | None = None,
        minimum_semantic_confidence: float = 0.55,
        minimum_malayalam_confidence: float = 0.55,
        minimum_gloss_confidence: float = 0.65,
        semantic_cache_size: int = 256,
    ) -> None:
        self._client = client
        self._semantic_model = semantic_model or model
        self._realization_model = realization_model or model
        self._max_output_tokens = max_output_tokens
        self._minimum_semantic_confidence = minimum_semantic_confidence
        self._minimum_malayalam_confidence = minimum_malayalam_confidence
        self._minimum_gloss_confidence = minimum_gloss_confidence
        self._semantic_cache_size = semantic_cache_size
        self._semantic_cache: OrderedDict[str, SemanticRepresentation] = OrderedDict()

    async def interpret(self, packet: ContentPacket) -> InterpretationResponse:
        semantic = await self._analyze_semantics(packet)
        if semantic.confidence < self._minimum_semantic_confidence:
            logger.warning(
                "semantic_confidence_below_threshold",
                extra={
                    "confidence": semantic.confidence,
                    "threshold": self._minimum_semantic_confidence,
                    "platform": packet.platform,
                },
            )
            return InterpretationResponse(
                summary=semantic.normalized_meaning,
                confidence=semantic.confidence,
                quality=InterpretationQuality(
                    semantic_accuracy=semantic.confidence,
                    malayalam_translation=0.0,
                    gloss_correctness=0.0,
                ),
                diagnostics=InterpretationDiagnostics(
                    source_text=packet.text,
                    semantic_representation=semantic.model_dump(mode="json"),
                    phrase_segments=[],
                )
                if packet.metadata.get("debug") is True
                else None,
            )

        interpretation_text = await self._create_response(
            model=self._realization_model,
            instructions=SIGNVERSE_ISL_SYSTEM_PROMPT,
            input_text=semantic.model_dump_json(),
            schema_name="signverse_isl_interpretation",
            schema_description="Malayalam and ISL realizations derived from validated meaning.",
            schema=INTERPRETATION_JSON_SCHEMA,
        )

        try:
            payload = OpenAIInterpretationPayload.model_validate_json(interpretation_text)
        except (ValidationError, ValueError, TypeError) as error:
            raise InvalidProviderResponseError() from error

        response = payload.to_api_response(
            semantic_confidence=semantic.confidence,
            minimum_malayalam_confidence=self._minimum_malayalam_confidence,
            minimum_gloss_confidence=self._minimum_gloss_confidence,
            semantic=semantic,
            source_text=packet.text,
            include_diagnostics=packet.metadata.get("debug") is True,
        )
        logger.info(
            "interpretation_confidence",
            extra={
                "semantic": semantic.confidence,
                "malayalam_translation": payload.confidence.malayalam_translation,
                "isl_gloss": payload.confidence.isl_gloss,
                "aggregate": response.confidence,
                "malayalam_fallback": not bool(response.malayalam_translation),
                "gloss_fallback": not bool(response.isl_gloss),
            },
        )
        return response

    async def _analyze_semantics(self, packet: ContentPacket) -> SemanticRepresentation:
        cache_packet = packet.model_dump(mode="json")
        cache_metadata = dict(cache_packet.get("metadata", {}))
        cache_metadata.pop("debug", None)
        cache_packet["metadata"] = cache_metadata
        cache_key = sha256(
            json.dumps(cache_packet, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        cached = self._semantic_cache.get(cache_key)
        if cached is not None:
            self._semantic_cache.move_to_end(cache_key)
            return cached

        semantic_text = await self._create_response(
            model=self._semantic_model,
            instructions=SEMANTIC_ANALYSIS_SYSTEM_PROMPT,
            input_text=json.dumps(packet.model_dump(mode="json"), ensure_ascii=False),
            schema_name="signverse_semantic_representation",
            schema_description="A validated representation of source meaning without translation.",
            schema=SEMANTIC_REPRESENTATION_JSON_SCHEMA,
        )
        try:
            semantic = SemanticRepresentation.model_validate_json(semantic_text)
        except (ValidationError, ValueError, TypeError) as error:
            raise InvalidProviderResponseError() from error
        if self._semantic_cache_size > 0:
            self._semantic_cache[cache_key] = semantic
            self._semantic_cache.move_to_end(cache_key)
            while len(self._semantic_cache) > self._semantic_cache_size:
                self._semantic_cache.popitem(last=False)
        return semantic

    async def _create_response(
        self,
        *,
        model: str,
        instructions: str,
        input_text: str,
        schema_name: str,
        schema_description: str,
        schema: dict[str, Any],
    ) -> str:
        try:
            response = await self._client.responses.create(
                model=model,
                instructions=instructions,
                input=input_text,
                max_output_tokens=self._max_output_tokens,
                store=False,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": schema_name,
                        "description": schema_description,
                        "strict": True,
                        "schema": schema,
                    }
                },
            )
        except APITimeoutError as error:
            raise ProviderTimeoutError() from error
        except RateLimitError as error:
            raise ProviderRateLimitError() from error
        except APIError as error:
            raise ProviderAPIError() from error
        return response.output_text

    async def close(self) -> None:
        await self._client.close()


def create_openai_client(
    api_key: str,
    timeout_seconds: float,
) -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=api_key,
        timeout=timeout_seconds,
        max_retries=0,
    )
