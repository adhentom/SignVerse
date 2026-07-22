# SignVerse AI Hackathon Readiness

## Review outcome

SignVerse is ready for a controlled hackathon demonstration. The extension, FastAPI service,
provider boundary, governed lexicon validation, playback planning, Malayalam output, and avatar
runtime operate through typed contracts. Demo Mode provides a deterministic offline path.

This is not yet a production ISL interpreter. Current lexicon entries and animations are draft,
the avatar motion is demonstrative rather than linguistically validated, and live platform DOM
integration remains sensitive to upstream UI changes.

## Architecture overview

```text
Visible page text / official YouTube caption / Google Meet caption
  → platform adapter
  → ContentPacket
  → Manifest V3 background service worker
  → FastAPI POST /interpret
  → mock or OpenAI Responses API provider
  → governed lexicon validation
  → deterministic PlaybackPlanner
  → typed InterpretationResponse
  → sidebar + Malayalam output + floating avatar renderer
```

Demo Mode replaces the network interpretation step with packaged fixtures and local Lottie
motion. It is off by default and persisted in `chrome.storage.local`.

## Feature checklist

| Area | Status | Notes |
|---|---|---|
| Manifest V3 extension | Ready | Service worker owns backend transport. |
| Website extraction | Ready for demo | Visible headings and paragraphs; capped at 50,000 characters. |
| YouTube captions | Ready for demo | Official caption DOM, playback state, navigation, and ten-entry history. |
| Google Meet captions | Ready for demo | Speaker, caption, reconnect state, and ten-entry history where DOM data exists. |
| FastAPI API | Ready | Typed `/health` and `/interpret`; structured logging and tests. |
| OpenAI provider | Ready with credentials | Responses API, strict JSON schema, no response storage, safe fallback. |
| Malayalam translation | Ready with OpenAI | Separate output field and copyable, scrollable UI. |
| Governed ISL layer | Foundation ready | Draft lexicon and deterministic validation; native review pending. |
| Playback planning | Ready | Exact governed-token lookup and explicit unsupported list. |
| Avatar renderer | Technical demo ready | Lottie, GLB, and VRM-capable abstraction; demo motion only. |
| Floating interpreter | Ready | Draggable/resizable geometry and avatar choice persist locally. |
| Demo Mode | Ready | Offline fixtures and packaged playback; disabled by default. |

## Stability fixes in this review

- Live-caption request identity now ignores timestamp-only updates, preventing duplicate
  interpretations while the same caption remains visible.
- The service worker no longer performs an unsolicited health request at startup; health is
  checked by the active production UI and Demo Mode remains network-independent.
- Late 3D loads are cancelled at the renderer lifecycle boundary, preventing orphaned WebGL
  animation loops after unmount or asset changes.
- GLB playback no longer resets its animation action on every 50 ms synchronization update.
- Drag listeners are removed on pointer cancellation and component unmount.
- Floating interpreter position and size now persist in local extension storage and are clamped
  when the viewport changes.
- Avatar and Demo Mode storage failures are contained, and late preference reads cannot overwrite
  a user's current avatar selection.

## Known limitations

- No current sign asset, gloss sequence, or avatar motion is certified or approved ISL.
- Malayalam-to-sign timing is proportional UI segmentation, not linguistic alignment.
- Current GLB demonstration assets are remote and require network access; offline Demo Mode uses
  the packaged Lottie asset.
- YouTube and Google Meet depend on undocumented platform DOM structures and may require selector
  maintenance.
- The production mock provider intentionally returns empty output. Use Demo Mode for a guaranteed
  presentation or configure the OpenAI provider for live interpretation.
- No speech recognition, audio capture, authentication, rate limiting, durable sessions, or
  server-side persistence is implemented.
- Chrome is the supported browser; Firefox and Safari extension manifests are not tested.
- Automated tests cover units and contracts, not a full browser session against live YouTube or
  Google Meet.

## Remaining risks

- A platform UI change can stop caption discovery without a compile-time signal.
- OpenAI latency, quota, rate limits, or connectivity can produce the safe empty response.
- Broad HTTP/HTTPS content-script matching means deployment needs explicit user education and a
  narrower activation/consent policy.
- Remote avatar hosting introduces availability and CORS risk outside Demo Mode.
- Draft linguistic content could be mistaken for authoritative interpretation unless the visible
  demonstration disclosure remains intact.
- Large pages and mutation-heavy applications can make semantic DOM scanning expensive, although
  extraction disconnects after the first usable packet.

## Accessibility checklist

- [x] Semantic sidebar landmark and accessible name
- [x] Visible keyboard focus styles
- [x] Escape-to-collapse with focus restoration
- [x] Named playback, retry, copy, drag, and avatar controls
- [x] Keyboard playback shortcuts and native range/select controls
- [x] Loading and error live regions
- [x] Malayalam language metadata and independently scrollable translation
- [x] Reduced-motion and high-contrast CSS support
- [x] Explicit unsupported-token and missing-animation feedback
- [x] Persistent user-selected avatar and interpreter geometry
- [ ] Screen-reader validation with NVDA, JAWS, VoiceOver, and TalkBack users
- [ ] Comprehension testing with deaf native ISL users
- [ ] Formal WCAG 2.2 AA audit

## Performance observations

- Content extraction is deferred and debounced; it stops observing after producing a packet.
- Live sessions coalesce DOM mutations through microtasks and cap history at ten entries.
- Interpretation is debounced for live captions and deduplicated by semantic content identity.
- Playback assets are promise-cached and the next item is preloaded.
- WebGL pixel ratio is capped at 2 and animation deltas are capped at 50 ms.
- The content bundle is approximately 1.17 MB uncompressed and 312 KB gzip, dominated by React,
  Three.js, VRM, and Lottie. Code splitting is constrained by the single IIFE content script.

## Security observations

- OpenAI credentials remain server-side and are read from environment variables.
- Content-script packets and backend responses are structurally validated.
- Backend URL host permissions are generated from the environment-specific origin.
- Provider input explicitly treats webpage text as untrusted data and rejects embedded prompts.
- OpenAI response storage is disabled and strict structured output is required.
- Wildcard credentialed CORS origins are rejected.
- Production deployment still requires authentication, authorization, quotas, request-size limits
  at the proxy, TLS, dependency scanning, and a restrictive deployment CORS policy.

## Privacy observations

- The extension does not persist extracted content, captions, translations, or interpretations.
- Avatar choice, overlay geometry, and Demo Mode preference are the only local settings stored.
- In production mode, visible page text or live captions are transmitted to the configured
  backend and, with the OpenAI provider, to OpenAI. This must be disclosed before public use.
- Google Meet deployment requires explicit participant notice, organizational approval, and a
  clear activation control before production use.

## Production recommendations

1. Complete native ISL review, provenance, licensing, performer consent, and comprehension tests.
2. Require explicit per-site activation and consent before transmitting content.
3. Bundle or serve approved avatar assets from a controlled CDN with integrity/version policy.
4. Add authentication, rate limiting, telemetry with content redaction, and operational alerts.
5. Add browser-level compatibility tests for pinned YouTube and Meet DOM fixtures.
6. Pin deployment dependencies and add automated dependency/security scanning.
7. Return an explicit degraded-service status instead of an indistinguishable empty `200`
   response once the public API contract can be versioned.

## Demo recommendations

- Reload the unpacked extension after every build and refresh the target tab.
- Start with Demo Mode to prove the complete deterministic experience without network risk.
- Keep the backend health page open only as supporting evidence, not as the primary demo.
- Describe the avatar as a renderer demonstration and the gloss as AI-proposed, governance-ready
  output—not validated ISL.
- Use one rehearsed website and prepared caption fixtures; avoid depending on live third-party UI.
- Keep a screen recording as a fallback for projector, WebGL, or venue-network failures.
