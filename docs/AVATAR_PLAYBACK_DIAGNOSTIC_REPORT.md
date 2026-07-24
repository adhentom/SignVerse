# SignVerse avatar playback diagnostic report

Date: 24 July 2026
Branch: `main`
Investigated commit: `564927bb5b54518d478b1c6996b1407c4d453016`

This report is a historical snapshot of the local verification environment at the date above.
Provider configuration, extension IDs, and approved-asset availability may differ in later
environments.

## Executive verdict

YouTube caption extraction and transport are working. The avatar does not sign because the
runtime produces no playable sign plan:

1. the local backend is explicitly configured with the `mock` interpretation provider;
2. that provider returns no governed ISL glosses;
3. the backend therefore returns an empty `PlaybackSequence`; and
4. the public-release backend and extension registries contain no approved sign animations.

The renderer is not the first failing stage. `RendererSession`,
`AvatarRuntimeCoordinator`, and `AvatarAnimationEngine` are not started when the sequence has
no resolvable playback item. A separate presentation defect made the idle avatar appear missing:
the shared player layout centered an intrinsically zero-height grid child. The overlay now
stretches that row, and the branded idle avatar is visible while it waits for a sequence.

| Verification | Result | Evidence |
|---|---:|---|
| YouTube cue extraction | PASS | Active extension sent YouTube packets to `/stream` |
| Content script to background port | PASS | WebSocket traffic followed live caption packets |
| Background to FastAPI WebSocket | PASS | `/stream` accepted the configured extension origin |
| `GET /health` | PASS | HTTP 200 and valid health schema |
| CORS preflight for `/interpret` | PASS | HTTP 200 with the configured extension origin |
| `POST /interpret` | TRANSPORT PASS | HTTP 200 and schema-valid response |
| Production interpretation output | FAIL | Provider is `mock`; `isl_gloss` is empty |
| Backend playback planning | FAIL | `playback.items` is empty |
| Backend approved asset registry | FAIL | `indexed_assets=0`, `mapped_tokens=0` |
| Extension approved animation registry | FAIL | zero dataset, animation, and native-review entries |
| Renderer scheduling in the current runtime | BLOCKED | No resolvable playback item reaches the renderer |
| Idle avatar visibility | PASS | SVG renderer occupies the full interpreter stage and displays the branded avatar |
| Renderer execution with a controlled approved fixture | PASS | Rendering integration tests exercise adapter, runtime, and engine |

## End-to-end trace

```text
YouTube official caption/transcript
  -> YouTubeCaptionSession
  -> ContentPacket
  -> useStreamingInterpretation
  -> StreamingPortClient
  -> Chrome runtime Port
  -> background StreamingBridge
  -> WebSocket /stream
  -> FastAPI InterpretationService
  -> configured MockInterpretationProvider
  -> isl_gloss = []
  -> PlaybackService
  -> PlaybackSequence.items = []
  -> stream response
  -> SignPlaybackPanel
  -> "PlaybackSequence empty"
  -> AvatarRenderer receives no asset
  -X RendererSession is not created
  -X AvatarRuntimeCoordinator is not started
  -X AvatarAnimationEngine.play() is not called
```

### Stage-by-stage result

1. **YouTube extraction**
   - Official DOM captions and transcript-track cues produce `ContentPacket` objects.
   - Advertisement playback produces no active packet.
   - Diagnostic event: `youtube_caption_received`.

2. **Content script**
   - A packet is segmented, assigned a session/sequence correlation ID, and sent through
     `StreamingPortClient`.
   - Diagnostic events: `content_packet_created`,
     `content_packet_sent_to_background`, and `interpretation_packet_sent`.

3. **Manifest V3 background**
   - A `StreamingBridge` is instantiated for the named runtime port.
   - The bridge queues the packet and sends it to `/stream`.
   - Unacknowledged packets are retained across WebSocket reconnects.
   - The content-side client now also replays unacknowledged packets if the runtime Port itself
     is lost during service-worker or page lifecycle changes.

4. **FastAPI**
   - `/health`, `/interpret`, and `/stream` are mounted and reachable.
   - The WebSocket receives the exact session ID, sequence number, platform, and correlation ID.

5. **Interpretation provider**
   - The configured provider is `mock`.
   - It returns a schema-valid `InterpretationResponse` with `isl_gloss=[]`.
   - This is the first functional stop in the current runtime.

6. **Playback service**
   - An empty gloss produces an empty sequence.
   - Independently, `SignAssetRegistry.health()` reports no indexed playable assets.

7. **Extension registry and renderer**
   - `datasetAssets.json`, `animationAssets.json`, and `nativeReviewRegistry.json` are empty.
   - The avatar animation metadata library is empty.
   - Handshape, expression, and transition metadata load successfully, but none of those
     libraries can create a sign without an approved animation.
   - The UI now reports the exact blocking stage instead of remaining in a generic preparation
     state.

## Root causes

### Root cause 1: non-production provider configuration

The ignored local backend environment selects the `mock` provider. No usable OpenAI key is
configured for this backend process. The mock provider intentionally returns an empty
interpretation rather than fabricating linguistic output.

Observed startup diagnostics:

```text
service_started interpretation_provider=mock
interpretation_provider_not_production_ready
diagnosis="The mock provider returns no governed ISL gloss."
```

Observed request diagnostics:

```text
interpretation_provider_empty_output
correlation_id="runtime-websocket:7"
diagnosis="PlaybackSequence empty: provider produced no governed ISL gloss."
```

### Root cause 2: no approved playable assets in the public build

The backend registry reports:

```json
{"status":"ready","indexed_assets":0,"mapped_tokens":0}
```

The extension asset counts are:

| Library | Count |
|---|---:|
| Dataset assets | 0 |
| Animation asset mappings | 0 |
| Native-review approvals | 0 |
| Avatar animation metadata | 0 |
| Handshapes | 8 |
| Expressions | 6 |
| Transitions | 5 |

`assets/signs/` contains project-authored placeholder SVGs only. The backend correctly excludes
`animation_type: placeholder` records from playback. The public-release documentation confirms
that third-party media and derived clips were excluded pending redistribution permission and
native ISL approval. Restoring those resources without authorization would violate the project's
governance boundary.

### Root cause 3: idle avatar row collapsed to zero height

The floating interpreter combines `sv-player-stage` and `sv-interpreter-overlay`. The shared
player rule centered grid children with a gap, while the SVG chain used percentage heights.
That left the interpreter avatar row with zero intrinsic height, so the SVG existed in the DOM
but had no visible pixels.

The overlay-specific rule now uses `align-items: stretch` and removes the inherited gap.
Post-fix runtime measurements on YouTube were:

```text
avatar area height: 354.32 px
avatar renderer height: 354.32 px
avatar SVG height: 354.32 px
avatar rig parts: 56
```

The SVG template and rig-node lookups are cached as immutable templates/references. This keeps
the visual fix stable during long sessions and reduced the 500 mount/dispose stress case from
roughly 40 seconds to roughly 4 seconds without changing rendering output.

### Not root causes

- YouTube caption extraction
- Content-script injection
- the runtime Port or `StreamingBridge`
- backend URL expansion
- `localhost` versus `127.0.0.1`
- HTTP versus HTTPS
- manifest host permissions
- REST CORS for the configured extension origin
- the response type guard
- animation scheduling code
- the SVG renderer itself

## Configuration verification

| Setting | Runtime value | Result |
|---|---|---:|
| Backend URL | `http://127.0.0.1:8000` | PASS |
| Request timeout | 10,000 ms | PASS |
| Manifest host permission | `http://127.0.0.1:8000/*` | PASS |
| REST allowed extension origin | configured unpacked-extension origin | PASS |
| Backend protocol | HTTP / WS on loopback | PASS |
| Provider | `mock` | NOT PRODUCTION READY |
| Approved backend assets | 0 | NOT PLAYABLE |
| Approved extension animations | 0 | NOT PLAYABLE |

The development WebSocket policy intentionally permits unpacked
`chrome-extension://` origins whose IDs are not in the explicit list. A warning now identifies
when that development-only bypass is used. Non-development environments reject unapproved
origins with WebSocket close code 1008. REST CORS remains restricted to the configured list.

## Runtime evidence

### HTTP health

```text
GET /health
HTTP/1.1 200 OK
access-control-allow-origin: <configured extension origin>

{"status":"ok","service":"signverse-api","version":"0.1.0","environment":"development"}
```

### REST preflight

```text
OPTIONS /interpret
HTTP/1.1 200 OK
access-control-allow-methods: GET, POST, OPTIONS
access-control-allow-headers: ... Content-Type, X-Request-ID ...
access-control-allow-origin: <configured extension origin>
```

### REST interpretation

Request correlation: `runtime-rest:1`

```json
{
  "summary": "",
  "malayalam_translation": "",
  "key_points": [],
  "keywords": [],
  "glossary": [],
  "isl_gloss": [],
  "confidence": 0.0,
  "playback": {
    "items": [],
    "unsupported_tokens": [],
    "missing": []
  }
}
```

### WebSocket interpretation

```text
interpretation_stream_connected
origin=<configured extension origin>

interpretation_stream_packet_received
correlation_id=runtime-websocket:7
session_id=runtime-websocket
sequence=7
platform=youtube

interpretation_provider_empty_output
provider=mock

interpretation_stream_packet_processed
gloss_count=0
playback_items=0
duration_ms=4.67
```

The WebSocket returned a valid `interpretation` envelope with matching session ID and sequence.
It did not return a playable sign.

## Reliability and diagnostics changes

- Added common structured runtime diagnostics with ISO timestamps and correlation IDs.
- Added caption, packet, backend request, WebSocket queue, playback, renderer, animation-start,
  and animation-completion events.
- Added precise empty-plan diagnostics:
  - `Backend unreachable`
  - `Invalid response schema`
  - `PlaybackSequence empty`
  - `No approved animation found`
  - `Renderer waiting for PlaybackSequence`
- Added service-worker runtime-Port replay for unacknowledged packets.
- Prevented unsupported stream error codes from crashing the sidebar.
- Added duplicate content-script and duplicate stream-port warnings.
- Stamped the widget host with the owning extension ID so two active unpacked builds can be
  identified on the same page.
- Added a warning for the development-only WebSocket origin bypass.
- Added startup readiness diagnostics for provider mode and asset counts.
- Ensured advertisement caption candidates are not logged as emitted interpretation packets.
- Included the request sequence in animation start/completion deduplication.

## Files changed by this investigation

Backend:

- `apps/api/src/signverse_api/app.py`
- `apps/api/src/signverse_api/services/interpretation.py`
- `apps/api/src/signverse_api/api/routes/streaming.py`

Extension transport and extraction:

- `apps/chrome-extension/shared/runtimeDiagnostics.ts`
- `apps/chrome-extension/background/BackendClient.ts`
- `apps/chrome-extension/background/StreamingBridge.ts`
- `apps/chrome-extension/background/index.ts`
- `apps/chrome-extension/content/index.tsx`
- `apps/chrome-extension/content/interpretation/StreamingPortClient.ts`
- `apps/chrome-extension/content/interpretation/useStreamingInterpretation.ts`
- `apps/chrome-extension/content/youtube/YouTubeCaptionSession.ts`

Extension playback and diagnostics:

- `apps/chrome-extension/overlay/FloatingWidget.tsx`
- `apps/chrome-extension/overlay/components/InterpretationPanel.tsx`
- `apps/chrome-extension/overlay/components/SignPlaybackPanel.tsx`
- `apps/chrome-extension/overlay/components/AvatarRenderer.tsx`
- `apps/chrome-extension/overlay/widget.css`
- `apps/chrome-extension/playback/RendererSession.ts`
- `apps/chrome-extension/playback/adapters/Avatar2DAdapter.ts`
- `apps/chrome-extension/playback/avatar/signVerseInterpreter/createSignVerseInterpreterSvg.ts`
- `apps/chrome-extension/playback/avatar/signVerseInterpreter/SignVerseSkeletalRig.ts`
- `apps/chrome-extension/playback/avatar/assets/AvatarAssetManager.ts`
- `apps/chrome-extension/playback/avatar/runtime/AvatarRuntimeCoordinator.ts`
- `apps/chrome-extension/playback/queue.ts`

Tests:

- `apps/chrome-extension/tests/content/StreamingPortClient.test.ts`
- `apps/chrome-extension/tests/content/StreamingInterpretation.test.ts`
- `apps/chrome-extension/tests/overlay/FloatingWidget.test.tsx`
- `apps/chrome-extension/tests/overlay/SignPlaybackPanel.test.tsx`
- `apps/chrome-extension/tests/playback/AvatarProductionRuntime.test.ts`

## Validation

| Check | Result |
|---|---:|
| Extension strict TypeScript | PASS |
| Extension ESLint | PASS |
| Extension tests | 308 passed in 68 files |
| Extension production Vite build | PASS |
| Backend Ruff check and format check | PASS |
| Backend mypy strict | PASS |
| Backend pytest | 81 passed |
| Backend coverage | 94.28% |
| `git diff --check` | PASS |

The production build contains the loopback backend URL, 10-second timeout, correct host
permission, and new diagnostic strings. The packaged animation directory contains only
`.gitkeep`, consistent with the empty approved registry.

## Required local remediation for real signing

These are configuration/data actions, not architecture changes:

1. Set `SIGNVERSE_INTERPRETATION_PROVIDER=openai` in the ignored local backend environment.
2. Provide `OPENAI_API_KEY` locally. Never commit it.
3. Import only legally authorized sign media through the existing governed dataset pipeline.
4. Complete provenance, license, consent, checksum, and native ISL review metadata.
5. Generate and approve animation clips through the existing conversion pipeline.
6. Rebuild the generated backend and extension asset manifests.
7. Rebuild and reload `apps/chrome-extension/dist`.

Until both the provider and approved-asset requirements are satisfied, SignVerse must display
subtitles and an explicit unavailable/empty-sequence diagnosis. It must not fabricate a sign.

## Remaining limitations

- Real animation execution cannot be truthfully confirmed in the current runtime because the
  backend generated no playback item and the extension contains no approved animation.
- Controlled renderer tests confirm that an approved fixture is loaded, scheduled, animated,
  paused, resumed, and disposed correctly. This is renderer verification, not evidence of current
  production ISL coverage.
- Chrome inspection found exactly one enabled unpacked SignVerse build; its generated local ID
  matched the configured backend CORS origin.
- The configured backend environment still selects `mock` and contains no OpenAI API key. If a
  key was added elsewhere, it is not visible to the running FastAPI process.
- Development WebSocket origin relaxation is intentionally broader than production and now emits
  a warning whenever it is used.
