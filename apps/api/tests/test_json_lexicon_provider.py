import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from signverse_api.models.linguistics import InterpretationGloss
from signverse_api.services.lexicon import JSONLexiconProvider, LexiconLoadError, LexiconProvider

LEXICON_PATH = Path(__file__).parents[1] / "resources" / "lexicon" / "lexicon.json"


@pytest.fixture
def provider() -> JSONLexiconProvider:
    return JSONLexiconProvider()


@pytest.mark.anyio
async def test_resource_is_a_draft_only_curated_seed(
    provider: JSONLexiconProvider,
) -> None:
    raw_document = json.loads(LEXICON_PATH.read_text(encoding="utf-8"))

    assert len(raw_document["entries"]) == 70
    assert all(entry["review_status"] == "draft" for entry in raw_document["entries"])
    assert all(entry["source"] == "" for entry in raw_document["entries"])
    assert all(entry["license"] == "" for entry in raw_document["entries"])
    assert isinstance(provider, LexiconProvider)


@pytest.mark.anyio
async def test_lookup_supports_token_id_and_token(provider: JSONLexiconProvider) -> None:
    by_id = await provider.lookup("greeting-hello")

    assert by_id is not None
    assert by_id.concept == "hello"
    assert by_id.confidence == 0.0
    assert await provider.lookup(by_id) == by_id
    assert await provider.lookup("missing") is None


@pytest.mark.anyio
async def test_lookup_concept_is_case_and_whitespace_insensitive(
    provider: JSONLexiconProvider,
) -> None:
    token = await provider.lookupConcept("  MOBILE PHONE ")

    assert token is not None
    assert token.id == "technology-mobile-phone"
    assert await provider.lookupConcept("not present") is None


@pytest.mark.anyio
async def test_lists_categories_tokens_version_and_health(
    provider: JSONLexiconProvider,
) -> None:
    categories = await provider.listCategories()
    tokens = await provider.listTokens()
    health = await provider.health()

    assert categories == sorted(
        [
            "Actions",
            "Education",
            "Government",
            "Greetings",
            "Healthcare",
            "Numbers",
            "Objects",
            "People",
            "Technology",
            "Time",
        ]
    )
    assert len(tokens) == 70
    assert health.total_tokens == 70
    assert health.categories == 10
    assert health.version == await provider.version() == "1.0"


@pytest.mark.anyio
async def test_provider_validation_and_deterministic_suggestions(
    provider: JSONLexiconProvider,
) -> None:
    known = await provider.lookup("education-student")
    assert known is not None
    unknown = known.model_copy(update={"id": "unknown-token"})
    conflicting = known.model_copy(update={"concept": "different meaning"})

    assert await provider.validate(InterpretationGloss(tokens=[known]))
    assert not await provider.validate(InterpretationGloss(tokens=[known, unknown]))
    assert not await provider.validate(InterpretationGloss(tokens=[conflicting]))
    assert [token.id for token in await provider.suggest("student")] == ["education-student"]
    assert await provider.suggest("student", limit=0) == []
    assert await provider.suggest("") == []


def test_invalid_json_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "lexicon.json"
    path.write_text("not-json", encoding="utf-8")

    with pytest.raises(LexiconLoadError, match="Unable to load governed lexicon"):
        JSONLexiconProvider(path)


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda document: document["entries"].append(document["entries"][0].copy()),
            "duplicate token IDs",
        ),
        (
            lambda document: document["entries"][0]["related_tokens"].append("missing"),
            "Unknown related token",
        ),
        (
            lambda document: document["entries"][1].update(
                {"concept": document["entries"][0]["concept"]}
            ),
            "Duplicate concept or synonym",
        ),
    ],
)
def test_invalid_lexicon_relationships_are_rejected(
    tmp_path: Path,
    mutate: Callable[[dict[str, Any]], None],
    message: str,
) -> None:
    document = json.loads(LEXICON_PATH.read_text(encoding="utf-8"))
    mutate(document)
    path = tmp_path / "lexicon.json"
    path.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(LexiconLoadError, match=message):
        JSONLexiconProvider(path)
