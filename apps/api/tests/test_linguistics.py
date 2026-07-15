from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from signverse_api.models.linguistics import InterpretationGloss, ISLToken, LexiconEntry
from signverse_api.services.lexicon import LexiconProvider


def create_token() -> ISLToken:
    return ISLToken(
        id="isl:welcome:1",
        concept="welcome",
        gloss="WELCOME",
        confidence=0.95,
        category="lexical",
        language="isl",
        region="pan-india",
        version="1.0.0",
    )


def test_interpretation_gloss_preserves_token_order() -> None:
    welcome = create_token()
    meeting = welcome.model_copy(
        update={"id": "isl:meeting:1", "concept": "meeting", "gloss": "MEETING"}
    )

    gloss = InterpretationGloss(tokens=[meeting, welcome])

    assert [token.gloss for token in gloss.tokens] == ["MEETING", "WELCOME"]


def test_token_rejects_confidence_outside_unit_interval() -> None:
    with pytest.raises(ValidationError):
        ISLToken.model_validate({**create_token().model_dump(), "confidence": 1.1})


def test_lexicon_entry_captures_governance_metadata() -> None:
    now = datetime.now(UTC)
    entry = LexiconEntry(
        token_id="isl:welcome:1",
        source="native-review-panel:2026-01",
        license="SignVerse-reviewed-v1",
        review_status="approved",
        created_at=now,
        updated_at=now,
    )

    assert entry.review_status == "approved"
    assert entry.updated_at == now


def test_lexicon_provider_is_structurally_typed() -> None:
    class IncompleteProvider:
        pass

    assert not isinstance(IncompleteProvider(), LexiconProvider)
