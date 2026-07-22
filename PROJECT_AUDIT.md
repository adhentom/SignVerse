# SignVerse Project Audit

## Architecture

SignVerse is a Manifest V3 extension plus a modular FastAPI service. Content adapters emit one shared `ContentPacket`; the content script owns extraction/session state, the background service worker owns backend transport, and the backend owns interpretation, governed gloss validation, and playback planning. A long-lived extension port connects to a background-owned `/stream` WebSocket. The UI merges streaming responses into an append-only playback queue.

## Findings

| Area | Status | Finding |
|---|---|---|
| Website extraction | PASS | Visible semantic text is extracted and sentence/paragraph segmentation starts before the complete article is consumed. |
| YouTube adapter | PASS (tests) | Caption updates, pause/seek/ad state, navigation, live pages, and Shorts paths exist; live Chrome verification is still required. |
| Google Meet adapter | PASS (tests) | Caption deduplication, speaker metadata, interruption, and reconnect paths exist; a real multi-participant meeting remains unverified. |
| WebSocket default | PASS | `StreamingPortClient` is the active interpretation hook and the background owns `/stream`. |
| REST fallback | FIXED | The REST client existed but was unreachable from streaming runtime. Packets created during sustained connecting/reconnecting now receive a bounded REST fallback. |
| Sidebar lifecycle | FIXED | Collapsing the sidebar previously unmounted playback and the avatar. One persistent controller now survives sidebar visibility. |
| Queue continuity | PASS | Append logic preserves active sequence prefixes and avoids playback reset on appended items. |
| Interpreter rendering | PARTIAL | The extension renders real supplied MP4 sign clips through a format adapter. A fully articulated 2D rig is not present in the supplied data. |
| Requested 2D interpreter | BLOCKED | No supplied asset has verified redistribution rights plus reviewed handshape, orientation, facial markers, and token timing. Generating arbitrary gestures would fabricate ISL. |
| Malayalam | PASS | Structured backend response is merged incrementally and shown beneath the floating renderer and in the sidebar. |
| Demo Mode | REMOVED | Demo fixtures, toggle, badge, and production bypass are absent. |
| Storage | PASS | Avatar choice and manually controlled interpreter geometry use `chrome.storage.local`. Sidebar intentionally starts closed and changes only through user input. |
| Accessibility | PASS with limitations | Keyboard, ARIA, contrast, reduced motion, focus transfer, and Malayalam language metadata are present. Native ISL quality is not an automated accessibility claim. |
| Dataset integration | PARTIAL | Six exact numeric assets are indexed and playable as draft mappings. Broader import and redistribution remain blocked by missing licensing/consent/provenance and the unavailable CSV. |

## Verified bugs fixed in this milestone

1. Sidebar minimization destroyed the floating interpreter and reset playback state.
2. REST fallback was documented but never invoked.
3. Overlay controls duplicated sidebar controls and allowed the primary interpreter to be closed.
4. Floating captions and controls overlapped the avatar.

## Production risks

- `/stream` has no authentication, durable resume token, or server-side idempotency store.
- WebSocket reconnect is bounded exponential backoff but service-worker suspension behavior needs long-duration browser testing.
- OpenAI latency dominates the local end-to-end budget.
- YouTube and Meet selectors depend on third-party DOMs.
- The bundled avatar asset is not a governed ISL corpus.
- Dataset licensing and performer consent are release blockers.

## Required path to a real 2D ISL interpreter

Acquire reviewed, redistributable vector rigs or motion/keypoint data containing hand joints, finger articulation, face/non-manual markers, timing, regional variant, token mapping, performer consent, and versioned reviewer approval. Import those records through the existing asset registry and renderer boundary. Until then, the product must show explicit unsupported concepts instead of synthesized gestures.
