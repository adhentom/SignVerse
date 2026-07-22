import json
from pathlib import Path

import pytest

from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse
from signverse_api.models.isl_plan import (
    InterpretationDiagnostics,
    InterpretationQuality,
    ISLGlossUnit,
    ISLPhraseSegment,
    NonManualMarker,
)
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


def playable_registry(tmp_path: Path) -> SignAssetRegistry:
    root = tmp_path / "signs"
    assets: tuple[tuple[str, str, str, list[str]], ...] = (
        ("action-help", "help", "test-help-v1", []),
        ("greeting-hello", "hello", "test-hello-v1", []),
        ("number-one", "one", "test-one-v1", ["1"]),
        ("greeting-yes", "yes", "test-yes-v1", ["affirmative"]),
        ("time-yesterday", "yesterday", "test-yesterday-v1", ["previous day"]),
    )
    for token_id, word, asset_id, synonyms in assets:
        directory = root / token_id
        directory.mkdir(parents=True)
        (directory / f"{word}.mp4").write_bytes(b"test-video")
        (directory / "metadata.json").write_text(
            json.dumps(
                {
                    "token_id": token_id,
                    "asset_id": asset_id,
                    "display_name": word.title(),
                    "category": "test",
                    "review_status": "approved",
                    "animation_type": "mp4",
                    "canonical_gloss": word.upper(),
                    "word": word,
                    "synonyms": synonyms,
                    "license": "test-only",
                    "license_status": "approved",
                    "confidence_score": 0.8,
                    "duration": 1.2,
                    "version": "1.0",
                }
            ),
            encoding="utf-8",
        )
    return SignAssetRegistry(root)


def test_planner_preserves_order_and_reports_missing_assets(tmp_path: Path) -> None:
    planner = PlaybackPlanner(playable_registry(tmp_path), default_duration=1.5)
    gloss = InterpretationGloss(
        tokens=[
            create_token("action-help", "help", 0.7),
            create_token("greeting-hello", "hello", 0.9),
            create_token("object-water", "water", 0.6),
        ]
    )

    sequence = planner.plan(gloss)

    assert [item.asset_id for item in sequence.items] == [
        "test-help-v1",
        "test-hello-v1",
    ]
    assert sequence.unsupported_tokens == ["object-water"]


def test_planner_schedules_exact_dataset_token_matches(tmp_path: Path) -> None:
    planner = PlaybackPlanner(playable_registry(tmp_path))
    gloss = InterpretationGloss(tokens=[create_token("number-one", "one", 0.9)])

    sequence = planner.plan(gloss)

    assert [item.asset_id for item in sequence.items] == ["test-one-v1"]
    assert sequence.items[0].duration == 1.2
    assert sequence.unsupported_tokens == []


def test_planner_rejects_non_positive_duration() -> None:
    with pytest.raises(ValueError, match="must be positive"):
        PlaybackPlanner(SignAssetRegistry(), default_duration=0)


def test_planner_rejects_invalid_asset_confidence_threshold() -> None:
    with pytest.raises(ValueError, match="between 0 and 1"):
        PlaybackPlanner(SignAssetRegistry(), minimum_asset_confidence=1.1)


def test_planner_can_gate_uncertain_gloss_asset_matches(tmp_path: Path) -> None:
    planner = PlaybackPlanner(playable_registry(tmp_path), minimum_asset_confidence=0.9)
    gloss = InterpretationGloss(tokens=[create_token("unmapped-token", "hello", 0.9)])

    sequence = planner.plan(gloss)

    assert sequence.items == []
    assert sequence.missing[0].reason == "asset-unavailable"
    assert "below the configured 0.90 threshold" in sequence.missing[0].detail


@pytest.mark.anyio
async def test_playback_service_resolves_validates_and_plans(tmp_path: Path) -> None:
    lexicon = JSONLexiconProvider(LEXICON_PATH)
    service = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(playable_registry(tmp_path)),
    )

    sequence = await service.create_sequence(["HELLO", "SCHOOL", "NOT IN LEXICON"], 0.85)

    assert [item.asset_id for item in sequence.items] == [
        "test-hello-v1",
    ]
    assert sequence.unsupported_tokens == [
        "unknown:2:not-in-lexicon",
        "education-school",
    ]
    assert sequence.missing[0].token == "NOT IN LEXICON"
    assert sequence.missing[0].normalized_token == "not in lexicon"
    assert sequence.missing[0].reason == "unknown-gloss"
    assert sequence.missing[1].reason == "lexicon-token-without-asset"


@pytest.mark.anyio
async def test_playback_service_normalizes_glosses_before_dataset_lookup(tmp_path: Path) -> None:
    lexicon = JSONLexiconProvider(LEXICON_PATH)
    service = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(playable_registry(tmp_path)),
    )

    sequence = await service.create_sequence(["  ONE! ", "yes", "YESTERDAY."], 0.85)

    assert [item.token_id for item in sequence.items] == [
        "number-one",
        "greeting-yes",
        "time-yesterday",
    ]
    assert sequence.missing == []


@pytest.mark.anyio
async def test_playback_service_decomposes_phrases_and_normalizes_plurals(tmp_path: Path) -> None:
    lexicon = JSONLexiconProvider(LEXICON_PATH)
    service = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(playable_registry(tmp_path)),
    )

    sequence = await service.create_sequence(["ONES_YES", "YESTERDAYS"], 0.85)

    assert [item.token_id for item in sequence.items] == [
        "number-one",
        "greeting-yes",
        "time-yesterday",
    ]
    assert sequence.missing == []

    unsupported = await service.create_sequence(["ARTIFICIAL_INTELLIGENCE"], 0.85)
    assert [miss.token for miss in unsupported.missing] == ["ARTIFICIAL_INTELLIGENCE"]


@pytest.mark.anyio
async def test_playback_service_rejects_incomplete_compound_decomposition() -> None:
    lexicon = JSONLexiconProvider(LEXICON_PATH)
    service = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(SignAssetRegistry()),
    )

    sequence = await service.create_sequence(["LANGUAGE-LABEL"], 0.85)

    assert sequence.items == []
    assert [miss.token for miss in sequence.missing] == ["LANGUAGE-LABEL"]
    assert sequence.missing[0].normalized_token == "language label"


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


@pytest.mark.anyio
async def test_public_release_does_not_load_generated_dataset_vocabulary() -> None:
    lexicon = JSONLexiconProvider()
    service = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(SignAssetRegistry()),
    )

    sequence = await service.create_sequence(["BEAUTIFUL"], 0.85)

    assert sequence.items == []
    assert sequence.missing[0].reason == "unknown-gloss"


def test_interpretation_response_has_backward_compatible_empty_playback() -> None:
    response = InterpretationResponse()

    assert response.playback.items == []
    assert response.playback.unsupported_tokens == []
    assert response.playback.missing == []


@pytest.mark.anyio
async def test_interpretation_service_appends_playback_plan(tmp_path: Path) -> None:
    class StubProvider:
        name = "stub"

        async def interpret(self, packet: ContentPacket) -> InterpretationResponse:
            del packet
            return InterpretationResponse(isl_gloss=["HELLO", "WATER"], confidence=0.9)

    lexicon = JSONLexiconProvider(LEXICON_PATH)
    playback = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(playable_registry(tmp_path)),
    )
    service = InterpretationService(StubProvider(), playback)
    packet = ContentPacket(
        platform="website",
        title="Example",
        timestamp="0",
        text="Hello water",
    )

    response = await service.interpret(packet)

    assert [item.asset_id for item in response.playback.items] == ["test-hello-v1"]
    assert response.playback.unsupported_tokens == ["object-water"]


@pytest.mark.anyio
async def test_phrase_context_reaches_playback_quality_and_debug_timeline(tmp_path: Path) -> None:
    marker = NonManualMarker(
        marker="brow-raise",
        value="yes-no-question",
        scope="phrase",
        timing="throughout",
        intensity=0.9,
    )
    segment = ISLPhraseSegment(
        segment_id="question-1",
        meaning="Ask whether the person is well",
        discourse_function="question",
        glosses=[
            ISLGlossUnit(
                gloss="HELLO",
                role="predicate",
                non_manual_markers=[marker],
                confidence=0.91,
            )
        ],
        confidence=0.9,
    )

    class StructuredProvider:
        name = "structured"

        async def interpret(self, packet: ContentPacket) -> InterpretationResponse:
            return InterpretationResponse(
                isl_gloss=["HELLO"],
                isl_segments=[segment],
                confidence=0.9,
                quality=InterpretationQuality(
                    semantic_accuracy=0.92,
                    malayalam_translation=0.9,
                    gloss_correctness=0.91,
                ),
                diagnostics=InterpretationDiagnostics(
                    source_text=packet.text,
                    semantic_representation={"intent": "question"},
                    phrase_segments=[segment],
                ),
            )

    lexicon = JSONLexiconProvider(LEXICON_PATH)
    service = InterpretationService(
        StructuredProvider(),
        PlaybackService(
            lexicon=lexicon,
            validator=GlossValidator(lexicon),
            planner=PlaybackPlanner(playable_registry(tmp_path)),
        ),
    )
    response = await service.interpret(
        ContentPacket(platform="google-meet", title="Stand-up", timestamp="1", text="Are you well?")
    )

    assert response.playback.items[0].phrase_id == "question-1"
    assert response.playback.items[0].non_manual_markers == [marker]
    assert response.quality is not None
    assert response.quality.asset_matching == 1.0
    assert response.quality.animation_readiness == 0.0
    assert response.quality.avatar_confidence == 0.0
    assert response.diagnostics is not None
    assert response.diagnostics.matched_assets == ["test-hello-v1"]
    assert response.diagnostics.playback_timeline[0]["start"] == 0.0
