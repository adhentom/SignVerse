"""Deterministic vocabulary normalization without linguistic inference."""

from __future__ import annotations

import re
import unicodedata


def normalize_term(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = re.sub(r"[_\-]+", " ", normalized)
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    return " ".join(normalized.split())


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize_term(value)).strip("-")


def phrase_variants(value: str) -> tuple[str, ...]:
    """Return spelling-only variants; never invent semantic synonyms."""
    normalized = normalize_term(value)
    if not normalized:
        return ()
    compact = normalized.replace(" ", "")
    hyphenated = normalized.replace(" ", "-")
    underscored = normalized.replace(" ", "_")
    return tuple(dict.fromkeys((normalized, compact, hyphenated, underscored)))


def normalized_terms(*groups: str) -> tuple[str, ...]:
    return tuple(
        dict.fromkeys(term for value in groups for term in phrase_variants(value))
    )
