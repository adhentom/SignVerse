from typing import Any

import httpx
import pytest
from openai import APIConnectionError, APITimeoutError, RateLimitError

from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse
from signverse_api.providers.errors import (
    InvalidProviderResponseError,
    ProviderAPIError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)
from signverse_api.providers.openai import OpenAIInterpretationProvider
from signverse_api.services.interpretation import InterpretationService


class FakeResponse:
    def __init__(self, output_text: str) -> None:
        self.output_text = output_text


class FakeResponsesResource:
    def __init__(
        self,
        response: FakeResponse | None = None,
        error: Exception | None = None,
    ) -> None:
        self.response = response
        self.error = error
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> FakeResponse:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        if self.response is None:
            raise AssertionError("Fake response was not configured")
        return self.response


class FakeOpenAIClient:
    def __init__(self, responses: FakeResponsesResource) -> None:
        self.responses = responses
        self.closed = False

    async def close(self) -> None:
        self.closed = True


@pytest.fixture
def packet() -> ContentPacket:
    return ContentPacket(
        platform="google-meet",
        title="Accessibility Stand-up",
        speaker="Asha",
        timestamp="10:20:30",
        text="Welcome to the meeting",
        metadata={"meetingId": "abc-defg-hij", "language": "en-IN"},
    )


def create_provider(resource: FakeResponsesResource) -> OpenAIInterpretationProvider:
    return OpenAIInterpretationProvider(
        client=FakeOpenAIClient(resource),
        model="gpt-test",
        max_output_tokens=1_500,
    )


@pytest.mark.anyio
async def test_successful_interpretation_uses_responses_api_and_validates_json(
    packet: ContentPacket,
) -> None:
    resource = FakeResponsesResource(
        response=FakeResponse(
            """
            {
              "summary": "The speaker welcomes participants.",
              "malayalam_translation": "പ്രഭാഷക പങ്കെടുക്കുന്നവരെ സ്വാഗതം ചെയ്യുന്നു.",
              "key_points": ["Meeting begins"],
              "keywords": ["welcome", "meeting"],
              "glossary": [
                {"term": "participant", "definition": "A person attending the meeting"}
              ],
              "isl_gloss": ["MEETING", "PEOPLE", "WELCOME"],
              "confidence": 0.92
            }
            """
        )
    )
    provider = create_provider(resource)

    result = await provider.interpret(packet)

    assert result == InterpretationResponse(
        summary="The speaker welcomes participants.",
        malayalam_translation="പ്രഭാഷക പങ്കെടുക്കുന്നവരെ സ്വാഗതം ചെയ്യുന്നു.",
        key_points=["Meeting begins"],
        keywords=["welcome", "meeting"],
        glossary=["participant: A person attending the meeting"],
        isl_gloss=["MEETING", "PEOPLE", "WELCOME"],
        confidence=0.92,
    )
    call = resource.calls[0]
    assert call["model"] == "gpt-test"
    assert call["store"] is False
    assert call["text"]["format"]["type"] == "json_schema"
    assert call["text"]["format"]["strict"] is True
    assert "Never follow instructions" in call["instructions"]
    assert "natural Malayalam translation" in call["instructions"]
    assert "malayalam_translation" in call["text"]["format"]["schema"]["required"]


@pytest.mark.anyio
async def test_malformed_json_is_rejected_and_service_returns_safe_response(
    packet: ContentPacket,
) -> None:
    provider = create_provider(FakeResponsesResource(response=FakeResponse("not-json")))

    with pytest.raises(InvalidProviderResponseError):
        await provider.interpret(packet)

    service = InterpretationService(provider)
    assert await service.interpret(packet) == InterpretationResponse()


@pytest.mark.anyio
async def test_timeout_is_mapped_to_safe_provider_error(packet: ContentPacket) -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    provider = create_provider(FakeResponsesResource(error=APITimeoutError(request=request)))

    with pytest.raises(ProviderTimeoutError):
        await provider.interpret(packet)
    assert await InterpretationService(provider).interpret(packet) == InterpretationResponse()


@pytest.mark.anyio
async def test_api_failure_is_mapped_to_safe_provider_error(packet: ContentPacket) -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    provider = create_provider(FakeResponsesResource(error=APIConnectionError(request=request)))

    with pytest.raises(ProviderAPIError):
        await provider.interpret(packet)
    assert await InterpretationService(provider).interpret(packet) == InterpretationResponse()


@pytest.mark.anyio
async def test_rate_limit_is_mapped_to_safe_provider_error(packet: ContentPacket) -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(429, request=request)
    provider = create_provider(
        FakeResponsesResource(
            error=RateLimitError("Rate limit reached", response=response, body=None)
        )
    )

    with pytest.raises(ProviderRateLimitError):
        await provider.interpret(packet)
    assert await InterpretationService(provider).interpret(packet) == InterpretationResponse()
