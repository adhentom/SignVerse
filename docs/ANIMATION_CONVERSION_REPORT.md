# Animation Conversion Report

> Historical local-build report: all source-derived outputs counted below are excluded from the
> public repository pending redistribution permission and native ISL approval.

Generated from the existing repository asset library with MediaPipe Holistic 0.10.21.

- Source MP4 files discovered: 160
- Canonical landmark clips generated: 159
- Runtime avatar clips generated: 159
- Explicit MP4-only fallbacks: 1 (`dataset-age`)
- Conversion failures: 0
- Rig 6.0 clips after deterministic landmark retargeting: 159
- Keyframes with detected thumb CMC motion: 5,012
- Preserved signed PIP samples below −10°: 6,672
- New external sign resources: 0
- Runtime animation payload: approximately 4.3 MB before production bundling

`dataset-age` remains MP4-only because signing-hand landmarks were verified in 2 of 41 frames,
below the 5% minimum (3 frames). No hand motion was synthesized to force an avatar result.

The report records extraction success, not native linguistic approval. Existing asset licensing,
review status, and provenance remain authoritative.
