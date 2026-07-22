# Current SignVerse Architecture

Audit baseline: branch `codex/websocket-realtime-interpreter`, starting commit `7184d4e` plus uncommitted production-hardening work requested in this task chain.

## Runtime flow

Website semantic text, YouTube captions, or Google Meet captions are normalized into `ContentPacket` values. The content script segments packets, sends them over a long-lived Chrome port, and the Manifest V3 background worker owns the `/stream` WebSocket. FastAPI validates the packet, invokes the configured mock/OpenAI interpretation provider, validates gloss against the governed lexicon, and returns Malayalam plus a playback plan. The extension merges responses and appends playback without resetting an active prefix.

## Production-ready boundaries

- Manifest V3 separation: content scripts do not contact the backend directly.
- Unified typed packet and response contracts.
- FastAPI routing, configuration, structured logging, validation, provider boundary, and tests.
- WebSocket-first streaming with reconnect/backoff and a bounded REST fallback.
- Incremental website/caption segmentation and platform adapters.
- Malayalam response rendering and explicit unsupported-token reporting.
- Queue, scheduler, cleanup, persistence, keyboard support, contrast, and reduced-motion primitives.

## Demonstration or placeholder code

- `content/demo/*`, the Demo Mode UI/storage hook, and `avatar/signverse-avatar.json` return fabricated offline output.
- The extension asset registry maps production-looking token IDs to one generic Khronos rig with the same non-ISL animation.
- Backend `assets/signs/*/placeholder.svg` entries are draft placeholders, not reviewed signs.
- Avatar profiles tint/scale one generic model; they are visual themes, not distinct approved interpreters.
- The mock provider is appropriate for tests/development only and must not be presented as production interpretation.

## Unused or misleading behavior

- Before this milestone, the REST client existed but was not reachable as streaming fallback; this has been corrected.
- Playback controls could operate generic motion even when the sign asset was explicitly marked draft.
- Demo Mode could persist and silently bypass `/stream`, making runtime verification misleading.

## Dataset readiness

The Drive collections contain many concept-named videos, but no verified license, performer consent, reviewer decision, canonical token mapping, regional metadata, or checksum manifest was supplied. `ISL_Dictionary_words.pdf` and `ISL_Dictionary_words.csv` are not present in the repository, attachments, or accessible Drive search. Filename-derived mappings would fabricate linguistic governance.

## Production decision

Only `approved` sign assets may be searchable or playable. With the currently supplied evidence, the approved index is empty. The correct production UI is therefore Malayalam/gloss plus explicit “sign unavailable,” never generic motion presented as ISL.
