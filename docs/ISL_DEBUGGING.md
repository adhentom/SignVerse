# ISL Debugging Mode

ISL debugging is an opt-in extension setting stored in `chrome.storage.local`. It is disabled by default and does not change normal production requests.

When enabled, the current `ContentPacket` requests diagnostic data and the sidebar shows:

- extracted source text;
- semantic representation and resolved context;
- phrase-level ISL plan and ordered gloss units;
- matched asset IDs and unsupported glosses;
- semantic, Malayalam, gloss, asset, animation, and avatar confidence;
- the playback timeline returned by the backend.

Changing the setting changes the stream source identity. The active source is reset once, avoiding a mixed standard/debug response and preventing duplicated queue entries. Diagnostics are excluded from API responses unless explicitly requested.

Use the view to find the first failed boundary:

1. Missing semantic unit: inspect segmentation and context.
2. Incorrect Malayalam: compare realization with the semantic representation.
3. Incorrect gloss order: inspect discourse role and referent fields.
4. Missing asset: inspect `missing_glosses` and the governed lexicon.
5. No avatar motion: inspect animation readiness, asset ID, and playback timeline.

Do not treat the debug confidence values as certification. Native ISL review remains required.
