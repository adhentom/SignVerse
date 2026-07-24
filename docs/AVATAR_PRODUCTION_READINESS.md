# Avatar Production Optimization and Release Readiness

## Scope

Phase 6.4 hardens the existing avatar subsystem for long-running Chromium sessions. It adds
runtime policy, capability detection, health monitoring, bounded recovery, and deterministic
cleanup around the renderer. It does not change:

- `PlaybackSequence`, cue timestamps, playback order, or scheduler behavior;
- interpretation, providers, vocabulary, datasets, or approved sign semantics;
- animation clips, handshape definitions, motion plans, or co-articulation endpoints;
- the `AvatarAssetManager` public contract; or
- the overlay, popup, permissions, onboarding, or production UI.

The optimization layer is presentation infrastructure only. It cannot create, approve, reorder,
or substitute a sign.

## Production Architecture

```text
Existing PlaybackSequence
  -> existing Playback Scheduler
  -> RendererSession
  -> RendererSupervisor
       -> bounded initialization/restart recovery
       -> WebGL context-loss observation where applicable
       -> playback intent and progress restoration
  -> Avatar2DAdapter
       -> AvatarRuntimeCoordinator
            -> one-time renderer warm-up
            -> resource-policy-aware cleanup
            -> asset health decoration
       -> AvatarAssetManager leases
       -> AvatarAnimationEngine
            -> existing animation and motion controllers
            -> RenderLoop
                 -> FrameScheduler
                 -> RenderingHealthMonitor
                 -> hierarchical SVG rig
```

Runtime implementation is under
`apps/chrome-extension/playback/avatar/runtime/`:

- `RuntimeResourcePolicy` selects the standard or reduced runtime policy.
- `FrameScheduler` uses `requestAnimationFrame` when available and a cancellable timer fallback
  when it is not.
- `RenderingHealthMonitor` maintains bounded frame-time and lifecycle statistics.
- `RendererSupervisor` wraps the unchanged renderer contract with bounded recovery.
- `AvatarRuntimeCoordinator` connects warm-up, cache lifecycle, and asset diagnostics without
  exposing asset-manager internals to playback.
- `BrowserCapabilities` reports supported Chromium families and optional feature degradation.

## Lifecycle and Long-Session Stability

Each mounted renderer has one supervised lifecycle. Mount, restart, and destruction use
generation checks so late asynchronous work cannot revive an obsolete renderer. Destruction:

1. invalidates pending recovery;
2. cancels the active animation-frame or timer callback;
3. detaches context-loss listeners;
4. disposes motion-controller state;
5. releases animation and visual leases exactly once;
6. removes the owned SVG root; and
7. makes released cache entries eligible for eviction or cleanup.

The render loop is idempotent: starting an already-running loop does not create another callback,
and stopping it invalidates a callback that is already queued. Frame histories use fixed-capacity
numeric buffers. Health metrics, trajectory caches, asset caches, and load-time histories are all
bounded, so their storage does not grow with session duration.

Long-session validation should exercise repeated mount/play/pause/seek/destroy cycles, late asset
loads, mid-transition interruption, recovery, and cache pressure. Acceptance requires stable
lease counts, no post-destroy rendering, no orphaned listeners or callbacks, and bounded cache and
diagnostic storage.

## Performance Tuning

The standard policy is the default and preserves full renderer behavior. Optimization is applied
without changing approved animation samples or playback time:

- rendering is scheduled only through one `FrameScheduler`;
- inactive frames may be intentionally skipped according to policy;
- active signing and transition endpoints are never skipped in a way that changes cue timing;
- controller state and SVG transforms are applied as one render pass;
- neutral poses, handshape metadata, expressions, render state, trajectory control points, and
  common generated trajectories are reused;
- frequently used animation assets can warm in the background;
- concurrent requests for one animation share a single in-flight load; and
- released, unpinned assets participate in bounded least-recently-used eviction.

Layout reads are kept out of the animation hot path. The SVG rig updates owned transform
attributes rather than measuring page geometry on every frame.

### Reduced resource mode

Reduced resource mode is optional and must be selected explicitly through
`configureAvatarResourceMode('reduced')`. Standard mode remains the default. The reduced policy:

- lowers inactive rendering frequency to approximately 15 FPS;
- scales non-linguistic secondary motion to 40 percent;
- reduces the generic asset-cache target from 64 entries to 16; and
- limits preload concurrency from two requests to one.

It does not reduce sign duration, omit approved keyframes, modify handshapes, change transition
endpoints, or alter `PlaybackSequence`. It is separate from
`prefers-reduced-motion`: the accessibility preference continues to suppress temporal decorative
motion, while resource mode controls runtime cost.

## Asset Cache Lifecycle

`AvatarAssetManager` remains the sole owner of avatar asset discovery, validation, loading, and
leases. Runtime optimization observes its public diagnostics and lifecycle methods only.

- In-flight loads and active leases are pinned.
- Successful released entries are ordered by recent use.
- Eviction selects released entries; active or pending assets are never evicted.
- Failed, corrupted, integrity-invalid, or metadata-invalid entries are removed so a later valid
  request can retry.
- Frequently used manifest entries are warmed once per manager.
- Reduced resource mode requests cleanup after renderer release and lowers generic cache pressure.
- `dispose()` invalidates late loads, clears cache state, and disposes providers deterministically.

Memory diagnostics prefer Chromium's non-standard `performance.memory.usedJSHeapSize` when
available. Otherwise the coordinator reports a clearly labeled asset-cache estimate. Neither
value is a precise per-avatar heap measurement.

## Rendering Health Diagnostics

Diagnostics are programmatic and developer-only. They are not added to production UI and contain
no captions, translations, gloss text, participant details, page content, or credentials.

The bounded health snapshot includes:

- average FPS;
- frame-time p50, p95, p99, and maximum;
- dropped-frame percentage;
- intentionally skipped inactive frames;
- memory estimate and its source;
- asset-cache hit ratio;
- average asset-load latency;
- render-loop uptime;
- recovery attempts and fatal-error count;
- active resource mode;
- detected browser family; and
- animation-frame or timer-fallback scheduler kind.

Frame-time percentiles use the most recent bounded sample window. Dropped-frame percentage is
calculated from observed rendered and estimated missed frames. Cache hit ratio is
`hits / (hits + misses)` and is zero before the first request. Asset-load latency uses the
manager's bounded recent-load history. Metrics support debugging and release qualification; they
must not be treated as linguistic-quality scores.

## Failure Recovery

`RendererSupervisor` preserves the existing renderer interface and records the last mounted
asset, playback context, progress, speed, transition source, and play/pause intent.

| Failure | Behavior |
| --- | --- |
| Transient initialization failure | Destroy partial state and retry once by default |
| Runtime renderer exception | Request one coalesced restart and restore renderer state |
| WebGL context loss | Pause; restart after the context-restored event |
| Corrupted or integrity-invalid asset | Reject without retrying the same invalid payload |
| Unsupported or unavailable asset | Preserve the established explicit fallback/error path |
| Late load after destroy or replacement | Release it and ignore it through generation checks |
| Recovery failure | Record a fatal error and leave the renderer in its established fallback state |

Concurrent recovery requests are coalesced. Recovery is bounded and never loops indefinitely.
Reconstruction restores presentation state only; the supervisor does not replay, reorder, or
reinterpret playback items.

## Browser Compatibility

The supported production family is modern desktop Chromium with Manifest V3:

| Browser | Support | Notes |
| --- | --- | --- |
| Google Chrome | Supported | Primary development and release target |
| Microsoft Edge | Supported | Chromium engine and Manifest V3 |
| Brave | Supported | Chromium engine; site/privacy settings can still block extension access |
| Other current Chromium builds | Best effort | Requires Manifest V3 and standard extension APIs |
| Non-Chromium browsers | Unsupported | Capability report marks the family unknown |

Capability detection is feature-based. Missing `requestAnimationFrame` uses a cancellable timer
fallback. Missing `performance.memory` uses an asset-cache estimate. Missing WebGL degrades only
WebGL-backed renderer options; the current SVG interpreter remains available. Missing media-query
support is reported rather than assumed. Browser identity does not alter sign data or linguistic
output.

## Accessibility Verification

Phase 6.4 does not change UI semantics or controls. Release verification must confirm:

- `prefers-reduced-motion` still suppresses decorative temporal motion;
- forced-colors/high-contrast styles remain legible;
- keyboard-only playback, avatar selection, drag, resize, minimize, close, and restore continue
  to work;
- existing labels, live regions, focus order, and screen-reader announcements are unchanged; and
- persisted avatar scale and user-controlled floating-window size remain effective.

Reduced resource mode is not an accessibility replacement. A user may enable it independently of
reduced motion.

## Deployment and Release Guidance

Before packaging a production extension:

1. Build with the intended backend URL and minimum host permissions.
2. Run ESLint, strict TypeScript, all unit and integration tests, rendering and motion
   regressions, long-session tests, and the production Vite build.
3. Validate the bundled avatar manifest and every distributed animation integrity declaration.
4. Run a soak session in current stable Chrome, Edge, and Brave.
5. Test standard mode, reduced resource mode, and reduced motion independently.
6. Exercise asset failure, forced renderer restart, rapid navigation, repeated overlay
   mount/unmount, and WebGL context recovery where a WebGL renderer is enabled.
7. Compare diagnostic snapshots at the beginning and end of the soak. Active leases, callbacks,
   listeners, and bounded caches must return to their expected steady state.
8. Confirm production UI does not expose developer diagnostics or internal resource paths.
9. Release only native-ISL-reviewed animation assets with documented provenance and rights.

Recommended soak scenarios are at least 30 minutes of continuous caption playback, 500 renderer
mount/destroy cycles, sustained cache churn beyond configured capacity, and repeated
pause/resume/seek/navigation. Thresholds should be recorded with browser version, hardware,
resource mode, asset set, and extension build hash rather than presented as universal guarantees.

## Known Limitations

- Browser heap telemetry is Chromium-specific and approximate; the cache estimate is intentionally
  conservative and is not a leak detector.
- Generic Chromium support is best effort because vendors may alter extension, privacy, media,
  or GPU policy.
- Timer fallback preserves lifecycle correctness but cannot guarantee animation-frame cadence.
- Recovery cannot repair a linguistically invalid, unsupported, corrupted, or unreviewed sign
  asset.
- Context-loss recovery is relevant only to canvas/WebGL renderers; the current SVG renderer has
  no graphics context to restore.
- Low-resource mode reduces decorative and inactive work but does not make an unsupported device
  a certified platform.
- Automated rendering and soak tests cannot certify ISL correctness. Native ISL review and
  Deaf-community comprehension testing remain release gates.
- The public animation manifest remains empty until redistributable clips complete licensing and
  native-review requirements.
