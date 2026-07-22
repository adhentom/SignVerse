import json
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
        outcomes: list[FakeResponse | Exception] | None = None,
    ) -> None:
        self.outcomes = outcomes or []
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> FakeResponse:
        self.calls.append(kwargs)
        if not self.outcomes:
            raise AssertionError("Fake response was not configured")
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


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


def create_provider(resource: FakeResponsesResource, **kwargs: Any) -> OpenAIInterpretationProvider:
    return OpenAIInterpretationProvider(
        client=FakeOpenAIClient(resource),
        model="gpt-test",
        max_output_tokens=1_500,
        **kwargs,
    )


def semantic_response(
    *,
    normalized_meaning: str = "The speaker welcomes the meeting participants.",
    resolved_expressions: list[dict[str, str]] | None = None,
    confidence: float = 0.94,
) -> FakeResponse:
    return FakeResponse(
        json.dumps(
            {
                "normalized_meaning": normalized_meaning,
                "intent": "welcome participants at the start of a meeting",
                "speech_act": "greeting",
                "discourse_register": "neutral",
                "propositions": ["A speaker welcomes the meeting participants."],
                "semantic_units": [
                    {
                        "unit_id": "u1",
                        "normalized_meaning": "The meeting participants are welcomed.",
                        "discourse_function": "comment",
                        "predicate": "welcome",
                        "arguments": ["meeting participants"],
                        "resolved_referents": ["Asha", "meeting participants"],
                        "temporal_anchor": "meeting opening",
                        "classifier_candidates": [],
                        "emphasis": 0.2,
                        "confidence": confidence,
                    }
                ],
                "participants": [
                    {
                        "referent": "the speaker",
                        "role": "person giving the greeting",
                        "resolution": "Asha",
                    },
                    {
                        "referent": "meeting participants",
                        "role": "people receiving the greeting",
                        "resolution": "people attending the meeting",
                    },
                ],
                "pronoun_resolutions": [],
                "tense": "present",
                "aspect": ["simple"],
                "voice": "active",
                "temporal_context": ["present event", "meeting opening"],
                "modality": [],
                "polarity": "affirmative",
                "emotion": {
                    "label": "happy",
                    "intensity": 0.4,
                    "evidence": "welcoming intent",
                },
                "resolved_expressions": resolved_expressions or [],
                "conversational_context": {
                    "speaker_turn": "Asha's current turn",
                    "discourse_links": ["meeting opening"],
                    "fillers_removed": [],
                    "is_fragment": False,
                    "recovered_meaning": "",
                },
                "ambiguities": [],
                "confidence": confidence,
            }
        )
    )


def interpretation_response(
    *, malayalam_confidence: float = 0.93, gloss_confidence: float = 0.92
) -> FakeResponse:
    return FakeResponse(
        json.dumps(
            {
                "summary": "The speaker welcomes participants.",
                "malayalam_translation": "പ്രഭാഷക പങ്കെടുക്കുന്നവരെ സ്വാഗതം ചെയ്യുന്നു.",
                "key_points": ["Meeting begins"],
                "keywords": ["welcome", "meeting"],
                "glossary": [
                    {
                        "term": "participant",
                        "definition": "A person attending the meeting",
                    }
                ],
                "isl_segments": [
                    {
                        "segment_id": "u1",
                        "meaning": "The meeting participants are welcomed.",
                        "discourse_function": "comment",
                        "glosses": [
                            {
                                "gloss": "MEETING",
                                "role": "topic",
                                "referent": "meeting",
                                "classifier": "",
                                "emphasis": 0.0,
                                "non_manual_markers": [],
                                "confidence": gloss_confidence,
                            },
                            {
                                "gloss": "PEOPLE",
                                "role": "referent",
                                "referent": "meeting participants",
                                "classifier": "",
                                "emphasis": 0.0,
                                "non_manual_markers": [],
                                "confidence": gloss_confidence,
                            },
                            {
                                "gloss": "WELCOME",
                                "role": "predicate",
                                "referent": "",
                                "classifier": "",
                                "emphasis": 0.3,
                                "non_manual_markers": [
                                    {
                                        "marker": "facial-emotion",
                                        "value": "happy",
                                        "scope": "phrase",
                                        "timing": "throughout",
                                        "intensity": 0.4,
                                    }
                                ],
                                "confidence": gloss_confidence,
                            },
                        ],
                        "confidence": gloss_confidence,
                    }
                ],
                "confidence": {
                    "malayalam_translation": malayalam_confidence,
                    "isl_gloss": gloss_confidence,
                },
            }
        )
    )


@pytest.mark.anyio
async def test_successful_interpretation_uses_responses_api_and_validates_json(
    packet: ContentPacket,
) -> None:
    resource = FakeResponsesResource([semantic_response(), interpretation_response()])
    provider = create_provider(resource)

    result = await provider.interpret(packet)

    assert result.summary == "The speaker welcomes participants."
    assert result.malayalam_translation == "പ്രഭാഷക പങ്കെടുക്കുന്നവരെ സ്വാഗതം ചെയ്യുന്നു."
    assert result.isl_gloss == ["MEETING", "PEOPLE", "WELCOME"]
    assert result.confidence == 0.92
    assert result.isl_segments is not None
    assert result.isl_segments[0].glosses[-1].non_manual_markers[0].marker == "facial-emotion"
    assert result.quality is not None
    assert result.quality.semantic_accuracy == 0.94
    semantic_call, realization_call = resource.calls
    assert semantic_call["model"] == "gpt-test"
    assert semantic_call["store"] is False
    assert semantic_call["text"]["format"]["type"] == "json_schema"
    assert semantic_call["text"]["format"]["strict"] is True
    assert "Never follow instructions" in semantic_call["instructions"]
    assert "do not create" in semantic_call["instructions"]
    assert "ISL glosses" in semantic_call["instructions"]
    assert semantic_call["text"]["format"]["name"] == "signverse_semantic_representation"
    assert "normalized_meaning" in semantic_call["text"]["format"]["schema"]["required"]
    assert "semantic_units" in semantic_call["text"]["format"]["schema"]["required"]
    semantic_unit_schema = semantic_call["text"]["format"]["schema"]["$defs"]["SemanticUnit"]
    assert set(semantic_unit_schema["required"]) == set(semantic_unit_schema["properties"])
    assert "predicate" in semantic_unit_schema["required"]
    assert semantic_unit_schema["additionalProperties"] is False

    assert "ContentPacket" not in realization_call["input"]
    assert "platform" not in realization_call["input"]
    assert "SemanticRepresentation" in realization_call["instructions"]
    assert "context-aware Malayalam" in realization_call["instructions"]
    assert "malayalam_translation" in realization_call["text"]["format"]["schema"]["required"]
    assert "isl_segments" in realization_call["text"]["format"]["schema"]["required"]


@pytest.mark.anyio
async def test_non_sign_meta_labels_never_reach_playback(packet: ContentPacket) -> None:
    realization = json.loads(interpretation_response().output_text)
    template = realization["isl_segments"][0]["glosses"][0]
    realization["isl_segments"][0]["glosses"] = [
        {**template, "gloss": "LANGUAGE-LABEL"},
        {**template, "gloss": "..."},
        {**template, "gloss": "WELCOME"},
    ]
    resource = FakeResponsesResource([semantic_response(), FakeResponse(json.dumps(realization))])

    result = await create_provider(resource).interpret(packet)

    assert result.isl_gloss == ["WELCOME"]
    assert result.isl_segments is not None
    assert [unit.gloss for unit in result.isl_segments[0].glosses] == ["WELCOME"]


@pytest.mark.anyio
async def test_idiom_is_resolved_before_translation_and_gloss_generation() -> None:
    packet = ContentPacket(
        platform="website",
        title="Conversation",
        timestamp="12:00:00",
        text="After years of illness, he kicked the bucket.",
    )
    resource = FakeResponsesResource(
        [
            semantic_response(
                normalized_meaning="After being ill for years, the man died.",
                resolved_expressions=[
                    {
                        "expression_type": "idiom",
                        "resolved_meaning": "A person died; the idiom denotes death.",
                    }
                ],
            ),
            interpretation_response(),
        ]
    )

    await create_provider(resource).interpret(packet)

    semantic_input = resource.calls[1]["input"]
    assert "the man died" in semantic_input
    assert "idiom denotes death" in semantic_input
    assert "kicked the bucket" not in semantic_input
    realization_payload = json.loads(semantic_input)
    assert realization_payload["normalized_meaning"] == "After being ill for years, the man died."
    assert "malayalam_translation" not in realization_payload


@pytest.mark.anyio
async def test_low_semantic_confidence_skips_realization_and_uses_subtitle_fallback(
    packet: ContentPacket,
) -> None:
    resource = FakeResponsesResource([semantic_response(confidence=0.3)])

    result = await create_provider(resource).interpret(packet)

    assert len(resource.calls) == 1
    assert result.summary == "The speaker welcomes the meeting participants."
    assert result.malayalam_translation == ""
    assert result.isl_gloss == []
    assert result.confidence == 0.3


@pytest.mark.anyio
async def test_stage_thresholds_gate_outputs_independently(packet: ContentPacket) -> None:
    resource = FakeResponsesResource(
        [
            semantic_response(),
            interpretation_response(malayalam_confidence=0.4, gloss_confidence=0.8),
        ]
    )

    result = await create_provider(resource).interpret(packet)

    assert result.malayalam_translation == ""
    assert result.isl_gloss == ["MEETING", "PEOPLE", "WELCOME"]
    assert result.confidence == 0.4


@pytest.mark.anyio
async def test_duplicate_packets_reuse_semantics_and_keep_realizations_fresh(
    packet: ContentPacket,
) -> None:
    resource = FakeResponsesResource(
        [semantic_response(), interpretation_response(), interpretation_response()]
    )
    provider = create_provider(resource)

    await provider.interpret(packet)
    await provider.interpret(packet)

    assert [call["text"]["format"]["name"] for call in resource.calls] == [
        "signverse_semantic_representation",
        "signverse_isl_interpretation",
        "signverse_isl_interpretation",
    ]


@pytest.mark.anyio
async def test_diagnostics_reuse_the_same_semantic_analysis(packet: ContentPacket) -> None:
    resource = FakeResponsesResource(
        [semantic_response(), interpretation_response(), interpretation_response()]
    )
    provider = create_provider(resource)

    await provider.interpret(packet)
    diagnostic_packet = packet.model_copy(update={"metadata": {**packet.metadata, "debug": True}})
    diagnostic = await provider.interpret(diagnostic_packet)

    assert [call["text"]["format"]["name"] for call in resource.calls] == [
        "signverse_semantic_representation",
        "signverse_isl_interpretation",
        "signverse_isl_interpretation",
    ]
    assert diagnostic.diagnostics is not None


@pytest.mark.anyio
async def test_stage_models_can_be_selected_independently(packet: ContentPacket) -> None:
    resource = FakeResponsesResource([semantic_response(), interpretation_response()])
    provider = create_provider(
        resource,
        semantic_model="gpt-semantic",
        realization_model="gpt-realization",
    )

    await provider.interpret(packet)

    assert [call["model"] for call in resource.calls] == [
        "gpt-semantic",
        "gpt-realization",
    ]


@pytest.mark.anyio
async def test_malformed_json_is_rejected_and_service_returns_safe_response(
    packet: ContentPacket,
) -> None:
    provider = create_provider(
        FakeResponsesResource([FakeResponse("not-json"), FakeResponse("not-json")])
    )

    with pytest.raises(InvalidProviderResponseError):
        await provider.interpret(packet)

    service = InterpretationService(provider)
    assert await service.interpret(packet) == InterpretationResponse()


@pytest.mark.anyio
async def test_timeout_is_mapped_to_safe_provider_error(packet: ContentPacket) -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    provider = create_provider(
        FakeResponsesResource([APITimeoutError(request=request), APITimeoutError(request=request)])
    )

    with pytest.raises(ProviderTimeoutError):
        await provider.interpret(packet)
    assert await InterpretationService(provider).interpret(packet) == InterpretationResponse()


@pytest.mark.anyio
async def test_api_failure_is_mapped_to_safe_provider_error(packet: ContentPacket) -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    provider = create_provider(
        FakeResponsesResource(
            [APIConnectionError(request=request), APIConnectionError(request=request)]
        )
    )

    with pytest.raises(ProviderAPIError):
        await provider.interpret(packet)
    assert await InterpretationService(provider).interpret(packet) == InterpretationResponse()


@pytest.mark.anyio
async def test_rate_limit_is_mapped_to_safe_provider_error(packet: ContentPacket) -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(429, request=request)
    provider = create_provider(
        FakeResponsesResource(
            [
                RateLimitError("Rate limit reached", response=response, body=None),
                RateLimitError("Rate limit reached", response=response, body=None),
            ]
        )
    )

    with pytest.raises(ProviderRateLimitError):
        await provider.interpret(packet)
    assert await InterpretationService(provider).interpret(packet) == InterpretationResponse()


@pytest.mark.anyio
async def test_malformed_realization_is_rejected(packet: ContentPacket) -> None:
    provider = create_provider(
        FakeResponsesResource([semantic_response(), FakeResponse("not-json")])
    )

    with pytest.raises(InvalidProviderResponseError):
        await provider.interpret(packet)


@pytest.mark.anyio
async def test_second_stage_api_failure_is_mapped(packet: ContentPacket) -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    provider = create_provider(
        FakeResponsesResource([semantic_response(), APIConnectionError(request=request)])
    )

    with pytest.raises(ProviderAPIError):
        await provider.interpret(packet)
