# 2D Renderer Architecture

```text
PlaybackSequence → AnimationScheduler → AssetRegistry → AssetLoader cache
→ RendererFactory → MP4 / Lottie / SVG renderer → floating interpreter
```

`Renderer` is the stable boundary. Every implementation mounts a loaded asset and implements
play, pause, seek, and destroy. The queue, scheduler, backend, and gloss pipeline never inspect
media format. Current indexed assets select `Mp4Adapter`; future reviewed 2D animation assets can
select the existing Lottie or SVG-sequence adapters without changing playback planning.

The host uses two rendering layers. The active layer remains visible while the next preloaded asset
mounts in the inactive layer. After decoding succeeds, the layers crossfade for 180 ms and the old
renderer is disposed. Reduced-motion preference makes the handoff immediate. A failed next asset
does not fabricate motion and reports `Sign unavailable`.

MP4 media is muted, inline, non-looping, non-interactive, preloaded, decode-checked, speed-aware,
seekable, and released with its object URL on disposal.
