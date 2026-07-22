# Dataset analysis

## Public-release decision

| Source | Intended use | Rights status | Public repository decision |
|---|---|---|---|
| Kaggle Indian Sign Language Dataset | Recognition research | No verified redistribution grant | Not bundled |
| Kaggle Indian Sign Language Animated Videos | Local landmark extraction and validation | Redistribution and derivative-data review pending | Videos, metadata imports, and derived clips excluded |
| ISLRTC dictionary and Google Drive catalog | Vocabulary research and authorized local import | Conditional; resource-specific permission required | Catalog and media excluded |
| Project-authored placeholder SVGs | Renderer and unsupported-state development | Original SignVerse material | Included under MIT; never treated as valid signs |
| Original SignVerse avatar artwork | Consistent branded interpreter | Original project artwork | Included under MIT |

The public release intentionally contains no playable ISL sign assets. Filenames and download
links are discovery hints, not linguistic authority or redistribution permission.

## Local import gate

Authorized assets must include a canonical gloss, stable token and asset IDs, source URL,
permission reference, license, attribution, consent basis, duration, checksum, and native ISL
review status. Promotion fails closed when required governance data is absent.

Use `config/isl_datasets.json` and `scripts/manage_isl_datasets.py` for configuration-driven intake.
Generated motion, catalogs, and source media remain ignored until a maintainer deliberately reviews
their public-release eligibility.

See [docs/datasets/LICENSING_AND_ACCESS.md](docs/datasets/LICENSING_AND_ACCESS.md) for the manual
permission-gated workflow.
