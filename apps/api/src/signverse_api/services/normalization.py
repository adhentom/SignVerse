"""Shared deterministic vocabulary normalization."""

import re
import unicodedata


def normalize_gloss(value: str) -> str:
    """Normalize provider gloss spelling without inferring linguistic meaning."""
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = re.sub(r"[_\-]+", " ", normalized)
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    return " ".join(normalized.split())


def gloss_candidates(value: str) -> list[str]:
    """Return deterministic spelling variants, most specific first."""
    normalized = normalize_gloss(value)
    candidates = [normalized]
    words = normalized.split()
    singular = [_singularize(word) for word in words]
    singular_phrase = " ".join(singular)
    if singular_phrase and singular_phrase != normalized:
        candidates.append(singular_phrase)
    return candidates


def decompose_gloss(value: str) -> list[str]:
    """Split a compound gloss without guessing concepts absent from its words."""
    return [gloss_candidates(word)[-1] for word in normalize_gloss(value).split()]


def _singularize(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return f"{word[:-3]}y"
    if (
        len(word) > 3
        and word != "yes"
        and word.endswith("s")
        and not word.endswith(("ss", "us", "is"))
    ):
        return word[:-1]
    return word
