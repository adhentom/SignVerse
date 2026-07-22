# SignVerse Internal ISL Specification

## Purpose

The linguistic layer is the governed boundary between probabilistic interpretation and every
downstream SignVerse capability. It records intended concepts as reviewable, versioned ISL
tokens before sign assets, motion, or presentation are selected. It is not a claim that written
gloss is ISL itself, nor a substitute for review by native ISL users and qualified linguists.

This specification establishes an internal representation; it does not change the public
`POST /interpret` contract. The current string gloss remains an integration format until a
separately versioned API is approved.

## Internal representation

An `InterpretationGloss` is an ordered list of `ISLToken` objects. Ordering is meaningful and
must be preserved. Each token contains:

- `id`: stable, provider-independent identity for the governed concept and variant.
- `concept`: language-neutral semantic intent, not necessarily a source-language word.
- `gloss`: human-readable canonical label used for review and annotation.
- `confidence`: confidence that this token represents the intended concept in context.
- `category`: lexical sign, classifier, fingerspelling, number, date, proper noun, or unknown.
- `language`: BCP 47-style language identifier for the sign-language system represented.
- `region`: optional reviewed regional variant identifier.
- `version`: immutable version of the token definition.

Token IDs should use a stable namespace such as `isl:<concept>:<variant>`. IDs must not encode
mutable display labels, asset locations, or provider-specific database keys.

## Gloss philosophy

Gloss is a controlled annotation of concepts and sequence, not English written in uppercase.
The representation prioritizes semantic preservation, natural ISL concept ordering, and
explicit uncertainty. A gloss label is never sufficient evidence that a sign is approved.
Only tokens linked to reviewed lexicon entries may advance to validated sign retrieval.

## Token format

Canonical gloss labels use uppercase ASCII words separated by hyphens for one compound token,
for example `NOT-YET`. Token sequences are represented as separate objects, never parsed from
spaces in a display string. Stable IDs and versions, rather than gloss labels, are used for
storage relationships.

Categories are intentionally constrained:

- `lexical`: established lexical sign.
- `classifier`: reviewed classifier construction placeholder.
- `fingerspelling`: explicit fingerspelled sequence.
- `number`: normalized numeric concept.
- `date`: normalized calendar concept.
- `proper-noun`: named entity with a reviewed sign name or fallback strategy.
- `unknown`: concept that cannot safely be represented with the governed lexicon.

## Confidence scoring

Confidence is a value from `0.0` to `1.0` attached to each token. It measures semantic and
lexical selection certainty for the current context; it is not a probability that a user will
understand an animation.

- `0.90–1.00`: high-confidence, context-supported selection of an approved token.
- `0.70–0.89`: usable only under the release-specific validation policy.
- `0.40–0.69`: uncertain; request review, offer alternatives, or use a governed fallback.
- `0.00–0.39`: do not select a sign asset automatically.

Thresholds are initial policy guidance and require calibration with native-user evaluation.
Sequence confidence must not hide one low-confidence token; consumers inspect token-level
confidence and provenance.

## Unknown concepts

Unknown meaning is represented explicitly with category `unknown`. The original concept and
context remain available to authorized review tooling, but an unknown token must not silently
map to a visually similar sign. Providers may suggest candidates; only an approved lexicon
entry can resolve the unknown for production retrieval.

## Fingerspelling

Fingerspelling is an explicit fallback, not the default for every missing concept. A
`fingerspelling` token preserves the normalized character sequence and its language context.
Systems must distinguish a reviewed lexical sign from fingerspelling and must not invent sign
names. Character inventory, handshape mapping, pacing, and comprehension rules require a
separate reviewed specification before rendering.

## Numbers

Numbers are stored as normalized semantic values with category `number`, while the gloss label
remains review-friendly. Consumers must preserve distinctions such as cardinal, ordinal,
currency, percentage, time, and measurement context. Rendering rules are deferred to the
governed lexicon and must not be inferred from digit strings alone.

## Dates

Dates use category `date` and preserve an unambiguous normalized calendar value plus source
context. Ambiguous forms such as `03/04/2026` must be resolved from locale or marked unknown.
Concept ordering and rendering of day, month, and year follow reviewed ISL conventions rather
than source-language punctuation.

## Proper nouns

Proper nouns use category `proper-noun`. Resolution order is: approved sign name for the exact
entity and region, approved conventional lexical sign, reviewed fingerspelling fallback, then
unknown. Personal sign names must never be inferred or generated without an approved source.

## Regional variants

Region identifies a reviewed variant and is optional when a token is intentionally
pan-regional or not yet classified. A regional preference selects among semantically equivalent
approved variants; it must not overwrite provenance. Variant relationships belong in lexicon
metadata, and fallback behavior must remain visible to users and reviewers.

## Future non-manual markers

Facial expression, head movement, gaze, mouth patterns, posture, and spatial grammar can carry
meaning in ISL. The token model intentionally leaves these out until a native-reviewed
annotation scheme is approved. A future version may add scoped non-manual markers spanning one
token or a token range. Consumers must not treat their current absence as linguistically
neutral or infer them directly from punctuation.

## Versioning and compatibility

Token definitions are immutable within a version. Semantic, gloss, category, or regional
changes create a new version and preserve lineage to the superseded entry. `InterpretationGloss`
is an internal model; exposing it outside the backend requires an explicitly versioned contract
and migration plan.
