import json
from collections.abc import Awaitable
from typing import Any, Protocol

from openai import APIError, APITimeoutError, AsyncOpenAI, RateLimitError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse
from signverse_api.prompts.isl_interpretation import SIGNVERSE_ISL_SYSTEM_PROMPT
from signverse_api.providers.errors import (
    InvalidProviderResponseError,
    ProviderAPIError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)

INTERPRETATION_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
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
        "isl_gloss": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "required": [
        "summary",
        "key_points",
        "keywords",
        "glossary",
        "isl_gloss",
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
    key_points: list[str]
    keywords: list[str]
    glossary: list[GlossaryEntry]
    isl_gloss: list[str]
    confidence: float = Field(ge=0, le=1)

    def to_api_response(self) -> InterpretationResponse:
        return InterpretationResponse(
            summary=self.summary,
            key_points=self.key_points,
            keywords=self.keywords,
            glossary=[f"{entry.term}: {entry.definition}" for entry in self.glossary],
            isl_gloss=self.isl_gloss,
            confidence=self.confidence,
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
    ) -> None:
        self._client = client
        self._model = model
        self._max_output_tokens = max_output_tokens

    async def interpret(self, packet: ContentPacket) -> InterpretationResponse:
        try:
            response = await self._client.responses.create(
                model=self._model,
                instructions=SIGNVERSE_ISL_SYSTEM_PROMPT,
                input=json.dumps(packet.model_dump(mode="json"), ensure_ascii=False),
                max_output_tokens=self._max_output_tokens,
                store=False,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "signverse_isl_interpretation",
                        "description": "A validated semantic interpretation and ISL gloss.",
                        "strict": True,
                        "schema": INTERPRETATION_JSON_SCHEMA,
                    }
                },
            )
        except APITimeoutError as error:
            raise ProviderTimeoutError() from error
        except RateLimitError as error:
            raise ProviderRateLimitError() from error
        except APIError as error:
            raise ProviderAPIError() from error

        try:
            payload = OpenAIInterpretationPayload.model_validate_json(response.output_text)
        except (ValidationError, ValueError, TypeError) as error:
            raise InvalidProviderResponseError() from error

        return payload.to_api_response()

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
