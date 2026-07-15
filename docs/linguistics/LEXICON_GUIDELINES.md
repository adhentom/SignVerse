# Governed ISL Lexicon Guidelines

## Purpose

The SignVerse lexicon is a versioned registry of linguistic concepts approved for defined uses.
It links tokens to evidence and review state; it does not contain raw datasets or imply that an
associated media asset is suitable for production.

## Entry lifecycle

1. **Proposed:** a contributor records the concept, candidate gloss, language, region, source,
   license, and intended use.
2. **Draft:** maintainers normalize identity, check duplicates, and verify required evidence.
3. **In review:** native ISL reviewers evaluate meaning, form, context, region, and limitations;
   a linguistic reviewer checks annotation consistency.
4. **Approved:** required reviewers sign off for a named lexicon version and use scope.
5. **Deprecated:** a replacement or material concern prevents new use while lineage remains.
6. **Rejected:** evidence, rights, quality, or linguistic review fails; the decision is retained
   to prevent accidental reintroduction.

Only `approved` entries may be consumed automatically by validated sign retrieval. Review
status for a token and suitability of a particular media asset are separate approvals.

## Review process

Every entry must have a reproducible review record containing candidate version, evidence,
reviewer role, decision, date, comments, region, and permitted use. Material disagreement is
recorded, not averaged away. Safety-sensitive or disputed concepts remain in review or unknown.

Approval policy must define the minimum number of native reviewers, independence requirements,
linguistic review, conflict-of-interest handling, and escalation. Those thresholds require
community governance and are not fixed by this engineering specification.

## Native reviewer workflow

- Present the concept in natural context, not as an isolated English word only.
- Show source evidence and known regional variants without biasing toward one candidate.
- Allow reviewers to approve, reject, propose a variant, mark unknown, or request more context.
- Capture accessibility preferences and compensate reviewers fairly.
- Obtain explicit consent for review records and any contributed media.
- Separate reviewer identity from broadly accessible exports while preserving an auditable
  approval record under controlled access.
- Re-review entries when meaning, evidence, region, asset, or intended use changes.

## Versioning

Lexicon releases use semantic versions. Corrections that do not change token identity are patch
releases; backward-compatible additions are minor releases; identity, meaning, or contract
changes require a major release. Approved entries are immutable within a release. Deprecation
and replacement relationships preserve historical interpretation reproducibility.

Every generated gloss should eventually record the lexicon provider and version used. Provider
versions must identify an immutable snapshot, regardless of whether storage is JSON,
PostgreSQL, Redis, or a remote service.

## Source attribution

An entry records a stable source identifier, owner or publisher, source version, access date,
relevant segment or annotation, and provenance chain. Derived entries cite every upstream
source and transformation. “Internet,” a filename, or a dataset title alone is insufficient.
Private reviewer evidence may use access-controlled identifiers rather than exposing personal
data.

## Dataset provenance requirements

Before dataset evidence can support an entry, governance must record:

- owner, collector, signer consent basis, and permitted uses;
- license text and version;
- acquisition method and original source;
- signer demographics and regional coverage where ethically collected;
- annotation author, method, language, and quality controls;
- file checksums, dataset version, transformations, and lineage;
- duplicate, leakage, mislabeling, and withdrawal checks; and
- restrictions for training, evaluation, redistribution, and production display.

Unknown or unverifiable provenance places the source in quarantine. Candidate Kaggle datasets
listed elsewhere in this repository remain research candidates until this intake is complete.

## Licensing expectations

A visible download link is not a license. Each source requires an explicit license compatible
with the intended use, including modification, model training where applicable, production
display, redistribution, and commercial use. Attribution and share-alike obligations must be
carried into downstream artifacts. Consent and personality or performer rights are evaluated
separately from copyright licensing.

Ambiguous, conflicting, revoked, or missing rights block production approval. Legal review is
required before adopting new license classes or publishing derived assets.

## Change control and audit

Lexicon changes are reviewed like production code but require linguistic approval in addition
to engineering review. Automated validation checks schemas, referential integrity, duplicate
IDs, version rules, attribution fields, and allowed status transitions. Automation cannot grant
linguistic approval. Release notes enumerate additions, deprecations, replacements, regional
changes, and known limitations.
