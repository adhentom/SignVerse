# ISL asset index

The public repository ships no third-party sign media or landmark-derived motion. The committed
`apps/chrome-extension/playback/datasetAssets.json` and `animationAssets.json` manifests are empty
by design.

`assets/signs/` contains only project-authored placeholder metadata and SVGs used to verify failure
states. The backend validates these records but excludes `animation_type: placeholder` from
playback. They are not ISL signs.

Authorized local imports can populate:

- `data/imports/` with source datasets;
- `assets/signs/<token>/` with governed local metadata and media;
- `apps/chrome-extension/public/animations/` with approved generated clips; and
- the generated runtime manifests.

These locations are ignored where appropriate to prevent accidental publication. A sign becomes
release-ready only after license, provenance, consent, and native ISL review gates pass.
