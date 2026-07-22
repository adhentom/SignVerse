# ISL Dataset Expansion Implementation Summary

The intake layer now supports configuration-driven CSV, JSON, MP4, and folder sources. It normalizes candidates, validates governance metadata, detects duplicate glosses and media, merges governed vocabulary, and generates a non-destructive asset index. Promotion is fail-closed: it requires an approved license status, a permission reference, and an approved/governed candidate. Existing assets are never overwritten.

ISLRTC Drive media remains manual-import-only until redistribution permission is recorded.

Duplicate identifier findings: `{"asset_ids": [], "token_ids": []}`.
