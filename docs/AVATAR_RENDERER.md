# Avatar Renderer

## Scope

The extension consumes the existing backend `PlaybackSequence` and renders each scheduled asset
with a local, format-specific renderer. It does not change interpretation, governed gloss,
lexicon validation, or playback planning. Bundled motion is a neutral hackathon demonstration,
not an approved ISL sign; every current registry entry remains visibly marked as draft pending
native ISL review.

```text
PlaybackSequence
→ client asset-registry lookup
→ cached asset loader and next-asset preload
→ deterministic animation scheduler
→ playback state machine
→ format renderer
→ avatar stage and synchronized Malayalam caption track
```

## Playback flow

`AnimationScheduler` converts item durations into deterministic start/end boundaries. The
playback controller owns elapsed time, current item, speed, seeking, and the states `Idle`,
`Loading`, `Playing`, `Paused`, `Finished`, and `Error`. Play, pause/resume, restart, previous,
next, seek, and speed controls operate only on this schedule; they never reorder or reinterpret
tokens.

The current item is resolved by `asset_id`. The next item is preloaded and successful loads are
reused from an in-memory promise cache. Missing, timed-out, malformed, or unsupported assets
produce an explicit fallback and remain listed as unsupported rather than being silently
substituted.

Malayalam translation remains a separate API field. Until the backend provides caption timing,
the extension divides the translation deterministically across the scheduled sign count and
highlights the segment associated with the current item. This is display synchronization, not a
linguistic word-to-sign alignment. The caption region scrolls independently.

## Renderer abstraction

All renderers implement the same lifecycle: mount a loaded asset, play, pause, seek, and destroy.
The factory currently exposes:

- Lottie adapter — active default, rendered as SVG through `lottie-web`.
- SVG-sequence adapter — displays a safe ordered list of image sources without injecting SVG
  markup into the page.
- GLB adapter — explicit interface stub that returns an unsupported-format error until a reviewed
  3D engine and asset pipeline are selected.

The React component knows only the renderer interface. A future renderer can therefore be added
without modifying scheduling or playback controls.

## Asset registry

The extension-local registry maps stable backend `asset_id` values to `token_id`, format, source,
duration, license, version, display name, and review status. Assets are packaged as Manifest V3
web-accessible extension resources. The backend remains the authority for playback order and
confidence; a duration disagreement is a registry/backend quality issue and does not change the
response contract.

Production assets require traceable provenance, redistribution and display rights, performer
consent, native ISL review, regional metadata, and reviewed timing. The current Lottie file is an
original neutral avatar motion used solely to exercise renderer mechanics.

## Accessibility and performance

- Keyboard: Space toggles play/pause, Left/Right seek, and Home restarts.
- Every transport and speed control has an accessible name.
- Current-token and error changes use live regions without announcing every animation frame.
- Reduced-motion users receive a static final pose while schedule/caption navigation remains
  available.
- High-contrast mode strengthens boundaries and caption highlighting.
- Loaded assets are cached, the next animation is preloaded, renderers are destroyed on asset
  change, and registry lookups do not trigger backend requests.

## Future avatar engines

MediaPipe may supply pose capture or validation, but should not become the playback asset format.
Ready Player Me, VRM, Sign3D, or another GLB-capable engine can implement the existing renderer
interface once rig, retargeting, transition, facial-marker, and licensing requirements are
approved. A production 3D adapter should load off the main thread where possible, reuse models
and clips, validate skeleton compatibility, and retain the same explicit missing-asset fallback.
