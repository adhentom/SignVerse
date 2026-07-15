from pathlib import Path

import pytest

from signverse_api.models.linguistics import InterpretationGloss, ISLToken
from signverse_api.services.lexicon import GlossValidator, JSONLexiconProvider

LEXICON_PATH = Path(__file__).parents[1] / "resources" / "lexicon" / "lexicon.json"


def token(token_id: str, concept: str, category: str = "lexical") -> ISLToken:
    return ISLToken.model_validate(
        {
            "id": token_id,
            "concept": concept,
            "gloss": concept.upper(),
            "confidence": 0.8,
            "category": category,
            "language": "ISL",
            "region": "India",
            "version": "1.0",
        }
    )


@pytest.mark.anyio
async def test_validator_reports_support_adjustments_and_category_coverage() -> None:
    validator = GlossValidator(JSONLexiconProvider(LEXICON_PATH))
    gloss = InterpretationGloss(
        tokens=[
            token("greeting-hello", "hello"),
            token("number-one", "one", "number"),
            token("missing-concept", "missing"),
        ]
    )

    result = await validator.validate(gloss)

    assert [item.id for item in result.supported_tokens] == ["greeting-hello", "number-one"]
    assert [item.id for item in result.unsupported_tokens] == ["missing-concept"]
    assert [item.adjusted_confidence for item in result.confidence_adjustments] == [0.0, 0.0, 0.0]
    assert [item.reason for item in result.confidence_adjustments] == [
        "pending-review",
        "pending-review",
        "unsupported",
    ]
    assert result.statistics.total_tokens == 3
    assert result.statistics.supported_tokens == 2
    assert result.statistics.unsupported_tokens == 1
    assert result.statistics.category_coverage["Greetings"].supported == 1
    assert result.statistics.category_coverage["Numbers"].supported == 1
    assert result.statistics.category_coverage["lexical"].unsupported == 1


@pytest.mark.anyio
async def test_validator_handles_an_empty_gloss() -> None:
    validator = GlossValidator(JSONLexiconProvider(LEXICON_PATH))

    result = await validator.validate(InterpretationGloss())

    assert result.statistics.total_tokens == 0
    assert result.supported_tokens == []
    assert result.unsupported_tokens == []
    assert result.statistics.category_coverage == {}
