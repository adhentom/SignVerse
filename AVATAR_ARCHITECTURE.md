# SignVerse Avatar Architecture

## Scope

The avatar is a rendering-layer implementation. Content extraction, translation, gloss generation,
asset lookup, streaming, and the playback queue remain unchanged.

## Renderer selection

`RendererFactory.createRendererForAsset()` is the only selection boundary:

1. An asset with a registered, reviewed `metadata.avatar_clip` uses `Avatar2DAdapter`.
2. Every other asset uses its existing renderer, including the production MP4 renderer.
3. With no scheduled asset, the same avatar adapter renders a neutral idle interpreter.

This prevents fabricated signs. Adding a validated avatar clip is a registry operation, not a queue
or protocol change.

## Vector rig

The commercial interpreter is an original gender-neutral SignVerse vector character designed around
the signing space rather than decoration. Rig 6.0 uses body → torso/pelvis; torso → neck/head and
hidden clavicle bones; clavicle → shoulder → upper arm → elbow → forearm → wrist → palm; and palm →
MCP → PIP → DIP chains for all ten fingers. Thumbs also include independent CMC joints. The 118-unit
upper arms and 112-unit forearms cannot be translated or scaled by clips, so connected limbs and
fixed proportions are runtime invariants. The original vector artwork is owned by the project and
introduces no third-party runtime or asset license.

MediaPipe landmarks are retained as source evidence and converted into local joint rotations. They
never directly position artwork. Each finger's four landmark points produce MCP, PIP, and DIP
rotations, enabling visible articulation without exposing dataset signer imagery. Shoulder-line tilt
drives hidden clavicle bones while upper-arm rotation is compensated to preserve the observed motion.

## Lifecycle

`RendererSession` normalizes every renderer to initialize, load, play, pause, resume, stop, seek, and
dispose. It wraps the existing renderer contract, so MP4 and the avatar share the same lifecycle
without changing the queue. Disposal cancels animation frames and removes the SVG tree.

## Production boundary

Real ISL motion uses source-derived, traceable AnimationClip files retargeted from validated MP4
landmarks. A clip is rendered only when its governed asset is registered. If clip loading or
validation fails, the validated MP4 remains the truthful fallback; no motion is fabricated.
