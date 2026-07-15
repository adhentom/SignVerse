from typing import Protocol, runtime_checkable

from signverse_api.models.linguistics import InterpretationGloss, ISLToken


@runtime_checkable
class LexiconProvider(Protocol):
    """Storage-neutral access to a versioned, governed ISL lexicon."""

    async def lookup(
        self,
        concept: str,
        *,
        language: str,
        region: str | None = None,
    ) -> ISLToken | None: ...

    async def validate(self, gloss: InterpretationGloss) -> bool: ...

    async def suggest(
        self,
        concept: str,
        *,
        language: str,
        region: str | None = None,
        limit: int = 10,
    ) -> list[ISLToken]: ...

    async def version(self) -> str: ...
