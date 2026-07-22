# Configurable ISL Dataset Import Pipeline

## Commands

Dry-run analysis performs no writes:

```bash
PYTHONPATH=scripts tools/.venv/bin/python scripts/manage_isl_datasets.py \
  --repository . analyze --dry-run
```

Generate the canonical vocabulary, asset index, and reports:

```bash
PYTHONPATH=scripts tools/.venv/bin/python scripts/manage_isl_datasets.py \
  --repository . analyze
```

Promote an approved local source and convert its videos:

```bash
PYTHONPATH=scripts tools/.venv/bin/python scripts/manage_isl_datasets.py \
  --repository . promote SOURCE_ID --convert
```

Promotion fails unless the source configuration has `license_status: approved`, a non-empty `permission_reference`, and each candidate is reviewed as `approved` or `governed`.

## Supported source adapters

- `csv`: configurable column mappings; use `record_kind: catalog` for navigation/link catalogs.
- `json`: an array or an object containing `entries` with configurable field mappings.
- `mp4`: one local video with an optional sibling `metadata.json`.
- `folder`: a configurable media glob over a local directory tree.

No adapter performs network access. Google Drive and other remote systems must be exported through an authorized manual workflow before configuring a local folder source.

## Candidate normalization

Every vocabulary candidate is normalized into canonical gloss, word, synonyms, aliases, alternate spellings, category, language, region, source, attribution, license state, review state, confidence, media checksum, and animation availability.

Normalization is deliberately spelling-only: Unicode normalization, case folding, underscore/hyphen normalization, whitespace normalization, and explicitly supplied aliases. It does not infer that two meanings are linguistically equivalent.

## Duplicate and ambiguity handling

- Token IDs and asset IDs are checked independently.
- Identical media is detected by SHA-256.
- Canonical duplicate glosses are grouped as asset variants.
- An alias owned by multiple concepts is reported and omitted from deterministic lookup.
- Existing asset directories or extension media files are never overwritten.

## Generated artifacts

- `apps/api/resources/lexicon/lexicon.generated.json`: backward-compatible governed runtime lexicon.
- `apps/api/resources/lexicon/unified_vocabulary.json`: rich vocabulary and provenance view.
- `assets/signs/index.json`: non-destructive enrichment for existing asset metadata.
- `docs/datasets/*REPORT.md`: reproducible intake, merge, coverage, and animation findings.

## Animation conversion

Promotion with `--convert` invokes the existing MediaPipe pipeline. A clip is emitted only when source-derived pose and hand landmark quality passes its acceptance threshold. Otherwise the validated MP4 remains the renderer fallback.
