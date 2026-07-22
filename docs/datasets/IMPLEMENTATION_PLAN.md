# ISL Knowledge Expansion Implementation Plan

## Constraints

- Preserve the existing interpretation, playback, renderer, and API contracts.
- Never overwrite an existing governed sign asset.
- Never create a sign without a validated source video.
- Treat externally discovered media as a candidate until provenance, license, and linguistic review are recorded.
- Keep restricted raw media outside Git. Only governed metadata and approved distributable assets may enter `assets/signs/`.

## Milestone 1 — Source and license audit

1. Inventory the uploaded CSV and record its checksum and schema.
2. Verify official ISLRTC access and permitted-use statements.
3. Classify every source as `approved`, `conditional`, `pending`, or `blocked`.
4. Configure conditional sources for manual import; do not scrape or bulk-download them.

Acceptance: a machine-readable source catalog and a human-readable audit explain exactly what may be automated.

## Milestone 2 — Configurable intake

1. Add adapters for CSV, JSON, an MP4 file, and a folder tree.
2. Normalize each source into one candidate schema.
3. Validate required metadata, paths, media types, checksums, and review state.
4. Detect duplicate IDs, normalized glosses, and identical media hashes.
5. Produce a dry-run report by default.

Acceptance: future local datasets can be added through configuration without changing Python code.

## Milestone 3 — Canonical vocabulary merge

1. Merge the governed lexicon with existing validated asset metadata.
2. Preserve homonyms and regional variants as separate concepts.
3. Index canonical glosses, synonyms, aliases, alternate spellings, and deterministic phrase variants.
4. Record provenance, review status, confidence, asset availability, and animation availability.

Acceptance: the generated vocabulary is deterministic, schema-valid, and never silently resolves an ambiguous alias.

## Milestone 4 — Governed asset import and animation conversion

1. Stage approved local candidates without mutating existing assets.
2. Require explicit license and review metadata before promotion.
3. Invoke the existing MediaPipe conversion pipeline for newly promoted MP4 files.
4. Retain the MP4 renderer whenever landmark quality does not satisfy the animation threshold.

Acceptance: source hashes prove lineage and no existing asset is overwritten.

## Milestone 5 — Compatible runtime enrichment

1. Extend internal asset metadata with optional provenance, confidence, aliases, and animation status.
2. Improve deterministic lookup using the generated vocabulary.
3. Keep existing API response models and extension message contracts unchanged.

Acceptance: all current clients continue working and existing lookups retain their behavior.

## Milestone 6 — Verification and reporting

Run Ruff, formatting checks, mypy, backend tests, converter/import tests, extension type checking, extension tests, and the production build. Generate dataset analysis, vocabulary merge, coverage, animation import, and implementation reports. Update Graphify after code changes.
