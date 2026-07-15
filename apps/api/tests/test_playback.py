from pathlib import Path

import pytest

from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse
from signverse_api.models.linguistics import InterpretationGloss, ISLToken
from signverse_api.services.interpretation import InterpretationService
from signverse_api.services.lexicon import GlossValidator, JSONLexiconProvider
from signverse_api.services.playback import PlaybackPlanner, PlaybackService, SignAssetRegistry

LEXICON_PATH = Path(__file__).parents[1] / "resources" / "lexicon" / "lexicon.json"


def create_token(token_id: str, concept: str, confidence: float = 0.8) -> ISLToken:
    return ISLToken(
        id=token_id,
        concept=concept,
        gloss=concept.upper(),
        confidence=confidence,
        category="lexical",
        language="ISL",
        region="India",
        version="1.0",
    )


def test_planner_preserves_order_and_reports_missing_assets() -> None:
    planner = PlaybackPlanner(SignAssetRegistry(), default_duration=1.5)
    gloss = InterpretationGloss(
        tokens=[
            create_token("action-help", "help", 0.7),
            create_token("greeting-hello", "hello", 0.9),
            create_token("object-water", "water", 0.6),
        ]
    )

    sequence = planner.plan(gloss)

    assert [item.token_id for item in sequence.items] == ["action-help", "greeting-hello"]
    assert [item.asset_id for item in sequence.items] == [
        "asset-placeholder-help",
        "asset-placeholder-hello",
    ]
    assert [item.duration for item in sequence.items] == [1.5, 1.5]
    assert [item.confidence for item in sequence.items] == [0.7, 0.9]
    assert sequence.unsupported_tokens == ["object-water"]


def test_planner_rejects_non_positive_duration() -> None:
    with pytest.raises(ValueError, match="must be positive"):
        PlaybackPlanner(SignAssetRegistry(), default_duration=0)


@pytest.mark.anyio
async def test_playback_service_resolves_validates_and_plans() -> None:
    lexicon = JSONLexiconProvider(LEXICON_PATH)
    service = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(SignAssetRegistry()),
    )

    sequence = await service.create_sequence(["HELLO", "SCHOOL", "NOT IN LEXICON"], 0.85)

    assert [item.token_id for item in sequence.items] == [
        "greeting-hello",
        "education-school",
    ]
    assert [item.confidence for item in sequence.items] == [0.0, 0.0]
    assert sequence.unsupported_tokens == ["unknown:2:not-in-lexicon"]


@pytest.mark.anyio
async def test_playback_service_handles_blank_and_assetless_glosses() -> None:
    lexicon = JSONLexiconProvider(LEXICON_PATH)
    service = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(SignAssetRegistry()),
    )

    sequence = await service.create_sequence(["", "WATER", "WATER"], 0.4)

    assert sequence.items == []
    assert sequence.unsupported_tokens == ["unknown:0:blank", "object-water"]


def test_interpretation_response_has_backward_compatible_empty_playback() -> None:
    response = InterpretationResponse()

    assert response.playback.items == []
    assert response.playback.unsupported_tokens == []


@pytest.mark.anyio
async def test_interpretation_service_appends_playback_plan() -> None:
    class StubProvider:
        name = "stub"

        async def interpret(self, packet: ContentPacket) -> InterpretationResponse:
            del packet
            return InterpretationResponse(isl_gloss=["HELLO", "WATER"], confidence=0.9)

    lexicon = JSONLexiconProvider(LEXICON_PATH)
    playback = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(SignAssetRegistry()),
    )
    service = InterpretationService(StubProvider(), playback)
    packet = ContentPacket(
        platform="website",
        title="Example",
        timestamp="0",
        text="Hello water",
    )

    response = await service.interpret(packet)

    assert [item.token_id for item in response.playback.items] == ["greeting-hello"]
    assert response.playback.unsupported_tokens == ["object-water"]
