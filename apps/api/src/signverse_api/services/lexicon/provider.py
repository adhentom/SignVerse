from typing import Protocol, runtime_checkable

from signverse_api.models.lexicon import LexiconHealth
from signverse_api.models.linguistics import InterpretationGloss, ISLToken


@runtime_checkable
class LexiconProvider(Protocol):
    """Storage-neutral access to a versioned, governed ISL lexicon."""

    async def lookup(
        self,
        token: str | ISLToken,
    ) -> ISLToken | None: ...

    async def lookupConcept(self, concept: str) -> ISLToken | None: ...

    async def listCategories(self) -> list[str]: ...

    async def listTokens(self) -> list[ISLToken]: ...

    async def health(self) -> LexiconHealth: ...

    async def validate(self, gloss: InterpretationGloss) -> bool: ...

    async def suggest(
        self,
        concept: str,
        limit: int = 10,
    ) -> list[ISLToken]: ...

    async def version(self) -> str: ...
