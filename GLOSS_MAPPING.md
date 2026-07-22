# Gloss Mapping

Lookup is deterministic and contains no AI inference after gloss generation.

1. Unicode NFKC and case-fold.
2. Convert underscores and hyphens to spaces.
3. Remove punctuation and collapse whitespace.
4. Try canonical gloss and concept.
5. Try governed synonyms and conservative singular forms (`YESTERDAYS` → `YESTERDAY`).
6. Decompose unmatched compounds (`ONE_YES` → `ONE`, `YES`) and resolve each part.
7. Return `NO_MATCH` for every unresolved part.

Each lookup logs the original token, normalized value, result type, and resolved token ID. Misses
are returned in `playback.missing` with `unknown-gloss` or
`lexicon-token-without-asset`. The extension logs and displays the exact missing token and reason.

Semantic approximation and fuzzy edit-distance matching are intentionally prohibited because a
similar English spelling does not establish an equivalent ISL sign.
