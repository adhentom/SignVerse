# Production ISL Asset Plan

1. Obtain the missing PDF/CSV and a signed source manifest covering redistribution, performer consent, and permitted transformations.
2. Normalize each reviewed entry to `asset_id`, governed `token_id`, concept/gloss, language, region, category, source file ID, checksum, duration, format, license, consent reference, reviewer, review status, and version.
3. Reject duplicates by checksum and require explicit reviewer selection for regional or numbered variants.
4. Transcode approved videos to a measured web profile and generate immutable registry records.
5. Index only approved records by asset ID, token ID, and normalized concept; unmatched gloss remains unsupported.
6. Feed lookup results into the existing append/cancel/seek scheduler without altering interpretation contracts.
7. Verify every enabled sign with native ISL reviewers before release and record regional/non-manual-marker limitations.

## Blocked deliverables

- Real ISL playback: blocked by zero approved, redistributable assets.
- Production 2D interpreter: blocked by missing reviewed video/vector rig assets with hands, fingers, face markers, timing, and token mappings.
- Coverage claims: blocked by unavailable CSV/PDF and lack of a recursive licensed manifest.
