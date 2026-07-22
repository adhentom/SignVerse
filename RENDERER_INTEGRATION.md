# Renderer Integration

## Runtime flow

`PlaybackSequence` → `SignPlaybackPanel` → `AssetRegistry` → `AvatarRenderer` →
`createRendererForAsset()` → avatar clip or existing media renderer.

The queue supplies the same asset IDs, timings, progress, and transport state as before. Renderer
selection is asset-aware but invisible to the queue.

## Fallback guarantee

An avatar renderer is selected only when the asset references a registered clip. Missing avatar clips
do not enter the avatar adapter: the asset's existing MP4, Lottie, SVG-sequence, GLB, or VRM renderer
is used. A corrupt or missing fallback asset follows the existing explicit error and retry path.

## Preloading and transitions

The next asset continues to preload through `AssetLoader`. Loaded promises are cached by asset ID.
Two renderer layers allow the next sign to mount before the previous renderer is disposed.

## Compatibility

No backend schema, WebSocket message, translation field, gloss token, asset lookup rule, or playback
queue behavior changed.
