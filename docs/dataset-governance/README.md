# Dataset Governance

## Supplied candidate datasets

1. Indian Sign Language Dataset: `https://www.kaggle.com/datasets/vaishnaviasonawane/indian-sign-language-dataset`
2. Indian Sign Language Animated Videos: `https://www.kaggle.com/datasets/koushikchouhan/indian-sign-language-animated-videos`

Both are research candidates only. Neither may be used for production assets or model training until its license and provenance are confirmed.

## Required intake checks

- Record source, owner, version, license, consent basis, and permitted uses.
- Create checksums and a machine-readable manifest.
- Inventory labels, formats, dimensions, duration, signer coverage, and variants.
- Detect corrupt, duplicate, mislabeled, or derived content.
- Obtain review from native ISL users and qualified language experts.
- Map assets to canonical lexemes, glosses, variants, and non-manual features.
- Split evaluation data by signer and source to reduce leakage.
- Preserve lineage from source asset through preprocessing, training, and release.

Raw media, processed datasets, model weights, and restricted annotations must remain outside Git in access-controlled storage.
