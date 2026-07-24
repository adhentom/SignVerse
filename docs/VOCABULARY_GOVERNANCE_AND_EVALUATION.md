# Vocabulary Governance and Evaluation

## Scope

Phase 5 provides a deterministic TypeScript pipeline for importing vocabulary candidates,
normalizing non-semantic formatting, detecting conflicts, recording human review, generating
versioned approved snapshots and regression fixtures, and measuring interpretation outcomes.

It does not modify synchronization, interpretation, provider, animation, playback, or UI
components. Automation supports governance but cannot grant linguistic approval.

## Pipeline

```text
Configured CSV / JSON sources
  -> DatasetImporter
  -> VocabularyNormalizer
  -> ConflictDetector
  -> human ReviewWorkflow
  -> ApprovedVocabularyBuilder
  -> immutable approved snapshot
       -> RegressionFixtureBuilder
       -> VocabularyEvaluator
       -> JSON / Markdown reports
```

## Dataset import

Each source supplies:

- a stable dataset ID;
- CSV or JSON content;
- declarative field mappings;
- optional category, region, version, provenance, and license defaults.

CSV supports quoted fields and escaped quotes. JSON accepts an array or an object containing an
`entries` array. Missing concepts or glosses, malformed documents, and unsupported categories
produce import issues instead of guessed values. Adding a source requires configuration, not a
new importer implementation.

The importer accepts text rather than filesystem paths so it can be used by browser tooling,
Node-based release scripts, controlled upload services, or tests without coupling governance to
one storage system.

## Normalization

Normalization is deliberately non-linguistic:

- Unicode NFKC and whitespace normalization;
- lowercase semantic lookup concepts;
- uppercase hyphenated review gloss labels;
- deterministic token IDs when a source does not provide one;
- normalized, deduplicated aliases;
- explicit category validation.

Normalization does not infer synonyms, translate concepts, merge regional variants, or approve
an ISL construction.

## Conflict detection

The detector reports:

- exact duplicate records;
- incompatible definitions sharing a token ID;
- one gloss assigned to different concepts;
- ambiguous concept or alias terms;
- conflicting licenses declared for one source.

Incompatible IDs, glosses, aliases, and provenance are blocking. Exact duplicates are warnings.
Approved records involved in a blocking conflict cannot be released.

## Human review workflow

Candidates begin as `draft`, then explicitly enter `in-review`. The default policy requires:

1. one native ISL approval;
2. one linguistic approval;
3. one licensing approval.

Each decision records reviewer ID, role, timestamp, decision, and notes. One rejection rejects
the candidate. Complete approval is blocked when source or license is absent. These engineering
rules do not replace reviewer consent, compensation, conflict-of-interest policy, or legal
review.

## Versioned releases

`ApprovedVocabularyBuilder` accepts an explicit semantic version and generation timestamp.
Only approved, conflict-free records enter the sorted snapshot. The artifact includes:

- schema and vocabulary versions;
- generation timestamp;
- deterministic content fingerprint;
- approved vocabulary entries;
- per-token provenance.

The fingerprint detects accidental artifact changes; it is not a cryptographic signature.
Release signing and protected reviewer records belong in controlled release infrastructure.

## Regression fixtures

Every approved canonical gloss and alias generates a stable lookup fixture containing the
vocabulary version, query, expected token ID, expected gloss, and expected match type. Running
these fixtures through `VocabularyLookup` detects identity or alias regressions after a dataset
or normalization change.

## Evaluation metrics

`VocabularyEvaluator` aggregates case-level observations using explicit denominators:

| Metric | Definition |
|---|---|
| Vocabulary coverage | Governed glosses / generated glosses |
| Unknown-word rate | Unknown source-word occurrences / source words |
| Fingerspelling rate | Fingerspelled gloss units / generated glosses |
| Gloss validation failure rate | Failed gloss occurrences / generated glosses |
| Interpretation confidence | Mean bounded case confidence |
| Playback success | Played items / governed glosses, capped at 100% |

Reports include raw counts so ratios remain auditable. Empty denominators return zero rather
than implying perfect coverage.

## Reporting

`EvaluationReportGenerator` produces deterministic JSON for automation and Markdown for release
review. Reports identify the immutable vocabulary version and explicit generation timestamp.
They contain aggregate and per-case results but no dataset media, credentials, or reviewer
personal data beyond what callers choose to place in case IDs.
