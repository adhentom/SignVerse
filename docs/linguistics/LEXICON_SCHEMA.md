# Governed JSON Lexicon Schema

## Scope

`apps/api/resources/lexicon/lexicon.json` is the first local, read-only SignVerse vocabulary.
It contains representative candidate concepts for exercising governance and validation. It is
not an authoritative ISL dictionary. Every seed record is `draft`; provenance and license are
blank pending native ISL review and rights verification.

The document contains a lexicon `version` and an ordered `entries` array. Duplicate token IDs,
duplicate concepts or synonyms, malformed records, and references to missing related tokens are
rejected when the provider loads the document.

## Entry fields

| Field | Meaning |
|---|---|
| `token_id` | Stable internal identity. It must not be an asset filename or database key. |
| `concept` | Normalized semantic lookup label used by this candidate vocabulary. |
| `gloss` | Human-readable candidate gloss label; it is not proof of an attested ISL sign. |
| `category` | Vocabulary domain: Greetings, Education, Technology, Government, Healthcare, Numbers, Time, Actions, People, or Objects. |
| `language` | Language-system label. The seed value is `ISL` as required by this local schema. |
| `region` | Intended regional review scope. `India` does not claim pan-Indian linguistic approval. |
| `version` | Version of this entry definition. |
| `review_status` | Governance state: draft, in-review, approved, deprecated, or rejected. |
| `source` | Stable evidence and attribution reference; blank means pending and blocks approval. |
| `license` | Verified license identifier and version; blank means pending and blocks approval. |
| `synonyms` | Deterministic concept aliases. They require the same review as the primary concept. |
| `related_tokens` | Existing token IDs with a reviewed relationship. Empty until relationships are approved. |

Vocabulary domain and linguistic token type are separate. For example, entries in the
`Numbers` domain become `number` tokens; other current seed domains become `lexical` tokens.
Future schema versions may record token type explicitly after linguistic review.

## Lookup and validation semantics

The JSON provider supports lookup by token ID or token object, normalized exact concept lookup,
category and token listing, deterministic substring suggestions, document version, structural
validation, and health statistics. It performs no AI inference or fuzzy semantic matching.

Presence in this file means “known candidate,” not “approved for output.” `GlossValidator`
reports known candidates as supported for coverage analysis, but caps confidence at `0.0` while
their review status is not `approved`. Missing tokens are unsupported and also receive an
adjusted confidence of `0.0`. Category coverage is calculated for each validation request.

## Review workflow

1. Propose a candidate with context and a stable token ID.
2. Add authoritative source and license records.
3. Check duplicates, regional scope, and intended use.
4. Obtain the required native ISL and linguistic reviews defined by governance policy.
5. Move to `approved` only after evidence, rights, meaning, and regional applicability pass.
6. Deprecate rather than delete published identities; record replacements and migration notes.

Engineering schema validation cannot approve an entry. Review decisions require auditable
human records outside this seed JSON until a governed review store is implemented.

## Provenance expectations

Source records must identify owner or publisher, source version, access date, exact segment or
annotation, contributor consent basis, transformations, and lineage. Dataset titles, filenames,
or download links alone are insufficient. Unverifiable provenance remains quarantined and must
not be copied into this lexicon as approved evidence.

## Licensing requirements

The `license` field must identify explicit terms compatible with the intended activity. Rights
for annotation, training, modification, production display, and redistribution are evaluated
separately. Performer consent and privacy obligations are not replaced by copyright permission.
Blank, ambiguous, incompatible, or revoked rights block approval and downstream sign retrieval.

## Versioning strategy

The document and entries begin at `1.0`. Published releases use semantic versioning:

- patch: metadata correction without meaning or identity change;
- minor: backward-compatible candidate or approved-token additions;
- major: identity, meaning, schema, or compatibility changes.

Approved entry definitions are immutable within a release. Reproducible validation records the
provider version. A future migration may move records to PostgreSQL or a remote service while
preserving token IDs, entry versions, review state, and provenance.
