import json
from pathlib import Path

from pydantic import ValidationError

from signverse_api.models.lexicon import GovernedLexiconEntry, LexiconDocument, LexiconHealth
from signverse_api.models.linguistics import InterpretationGloss, ISLToken
from signverse_api.services.normalization import normalize_gloss

LOCAL_LEXICON_ROOT = Path(__file__).resolve().parents[4] / "resources" / "lexicon"
PACKAGED_LEXICON_ROOT = Path(__file__).resolve().parents[2] / "resources" / "lexicon"
LOCAL_GENERATED_PATH = LOCAL_LEXICON_ROOT / "lexicon.generated.json"
LOCAL_SEED_PATH = LOCAL_LEXICON_ROOT / "lexicon.json"
PACKAGED_GENERATED_PATH = PACKAGED_LEXICON_ROOT / "lexicon.generated.json"
PACKAGED_SEED_PATH = PACKAGED_LEXICON_ROOT / "lexicon.json"
DEFAULT_LEXICON_PATH = next(
    path
    for path in (
        LOCAL_GENERATED_PATH,
        LOCAL_SEED_PATH,
        PACKAGED_GENERATED_PATH,
        PACKAGED_SEED_PATH,
    )
    if path.is_file()
)


class LexiconLoadError(ValueError):
    """Raised when a local lexicon cannot be loaded as a valid governed document."""


class JSONLexiconProvider:
    """Read-only local JSON implementation of the governed lexicon contract."""

    def __init__(self, path: Path = DEFAULT_LEXICON_PATH) -> None:
        self._path = path
        self._document = self._load(path)
        self._entries_by_id = {entry.token_id.casefold(): entry for entry in self._document.entries}
        self._entries_by_concept = self._index_concepts(self._document.entries)
        self._validate_relationships()

    @staticmethod
    def _load(path: Path) -> LexiconDocument:
        try:
            raw_document = json.loads(path.read_text(encoding="utf-8"))
            document = LexiconDocument.model_validate(raw_document)
        except (OSError, json.JSONDecodeError, ValidationError) as error:
            raise LexiconLoadError(f"Unable to load governed lexicon: {path}") from error

        token_ids = [entry.token_id.casefold() for entry in document.entries]
        if len(token_ids) != len(set(token_ids)):
            raise LexiconLoadError("Governed lexicon contains duplicate token IDs.")
        return document

    @staticmethod
    def _index_concepts(
        entries: list[GovernedLexiconEntry],
    ) -> dict[str, GovernedLexiconEntry]:
        index: dict[str, GovernedLexiconEntry] = {}
        for entry in entries:
            for term in (entry.concept, *entry.synonyms):
                normalized = normalize_gloss(term)
                if normalized in index and index[normalized].token_id != entry.token_id:
                    raise LexiconLoadError(f"Duplicate concept or synonym: {term}")
                index[normalized] = entry
        return index

    def _validate_relationships(self) -> None:
        known_ids = set(self._entries_by_id)
        for entry in self._document.entries:
            missing = [
                token_id
                for token_id in entry.related_tokens
                if token_id.casefold() not in known_ids
            ]
            if missing:
                raise LexiconLoadError(
                    f"Unknown related token for {entry.token_id}: {', '.join(missing)}"
                )

    @staticmethod
    def _to_token(entry: GovernedLexiconEntry) -> ISLToken:
        confidence = 1.0 if entry.review_status == "approved" else 0.0
        return entry.to_token(confidence=confidence)

    async def lookup(self, token: str | ISLToken) -> ISLToken | None:
        token_id = token.id if isinstance(token, ISLToken) else token
        entry = self._entries_by_id.get(token_id.strip().casefold())
        return self._to_token(entry) if entry is not None else None

    async def lookupConcept(self, concept: str) -> ISLToken | None:
        entry = self._entries_by_concept.get(normalize_gloss(concept))
        return self._to_token(entry) if entry is not None else None

    async def listCategories(self) -> list[str]:
        return sorted({entry.category for entry in self._document.entries})

    async def listTokens(self) -> list[ISLToken]:
        return [self._to_token(entry) for entry in self._document.entries]

    async def health(self) -> LexiconHealth:
        categories = await self.listCategories()
        return LexiconHealth(
            version=self._document.version,
            total_tokens=len(self._document.entries),
            categories=len(categories),
        )

    async def validate(self, gloss: InterpretationGloss) -> bool:
        for token in gloss.tokens:
            if not self.matches(token):
                return False
        return True

    async def suggest(self, concept: str, limit: int = 10) -> list[ISLToken]:
        if limit <= 0:
            return []
        normalized = normalize_gloss(concept)
        matches = [
            self._to_token(entry)
            for term, entry in self._entries_by_concept.items()
            if normalized and normalized in term
        ]
        unique_matches = {token.id: token for token in matches}
        return list(unique_matches.values())[:limit]

    async def version(self) -> str:
        return self._document.version

    def entry_for(self, token: str | ISLToken) -> GovernedLexiconEntry | None:
        token_id = token.id if isinstance(token, ISLToken) else token
        return self._entries_by_id.get(token_id.strip().casefold())

    def matches(self, token: ISLToken) -> bool:
        entry = self.entry_for(token)
        if entry is None:
            return False
        canonical = entry.to_token(confidence=token.confidence)
        return canonical == token
