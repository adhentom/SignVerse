# Production Avatar Rendering Engine

## Scope

Phase 6.1 refactors the existing SVG avatar renderer into focused rendering controllers while
preserving `PlaybackSequence`, renderer, asset, synchronization, interpretation, provider,
governance, and scheduling contracts. The renderer remains a pure consumer of approved
playback items and validated animation clips.

No production UI was added or changed.

## Components

```text
PlaybackSequence
  -> existing scheduler and RendererSession
  -> Avatar2DAdapter
       -> lazy cached AnimationClip
       -> AvatarAnimationEngine facade
            -> AnimationController
            -> BlendController
            -> HandController
            -> ExpressionController
            -> SecondaryMotionController
            -> RigController
            -> RenderLoop
                 -> SignVerseSkeletalRig
                 -> SVG
```

### Rig Controller

`RigController` is the only controller that applies poses to the hierarchical
`SignVerseSkeletalRig`. The rig retains fixed arm lengths, constrained local rotations,
parent-child transforms, neutral signing posture, breathing, gaze, and blinking. It exposes an
immutable neutral pose for safe blend-out.

### Animation Controller

`AnimationController` owns clip time, speed, seeking, keyframe sampling, eased interpolation,
and shortest-path angle interpolation. Playback rate is bounded to the supported `0.25x–2x`
range. It does not know token meaning, vocabulary, captions, or synchronization state.

### Blend Controller

`BlendController` performs bounded, configurable blend-in and blend-out:

- transition duration comes from `PlaybackItem.transition_ms`;
- a captured live pose is the source for interruption-safe sign changes;
- joint angles use shortest-path interpolation;
- hand projection, opacity, scale, and facial translations blend continuously;
- completed clips present their final frame before returning smoothly to neutral;
- reduced-motion mode disables temporal blending.

The existing renderer-layer crossfade may still blend complete SVG layers while the blend
controller maintains skeletal continuity inside the incoming avatar.

### Hand Controller

`HandController` references reusable handshape definitions by stable ID. Left and right hands
are controlled independently. Definitions cover thumb CMC/MCP/PIP/DIP and each finger’s
MCP/PIP/DIP chain. Playback code contains no joint-angle constants.

### Expression Controller

`ExpressionController` reads only governed non-manual metadata attached to the current playback
item. Supported controls include blink, gaze, eyebrow raise/lower, head nod/shake/tilt, mouth
posture, body shift, and named facial expressions. Missing metadata resolves to a neutral face.
Non-manual grammar is applied after skeletal blend-in so it is not accidentally faded by the
previous sign.

### Secondary Motion Controller

Secondary motion is deliberately small:

- clavicles follow upper-arm motion by at most 2.5 degrees;
- torso stabilization is capped at 1.2 degrees;
- idle head motion remains below one degree.

These offsets preserve the source sign’s hand location and movement while avoiding a frozen
torso. Elbow and wrist paths remain driven by interpolated local rotations and fixed-length
bone chains.

### Render Loop

`RenderLoop` owns one cancellable `requestAnimationFrame` lifecycle. Starting is idempotent,
pause/dispose cancels the pending frame, and callbacks check lifecycle state before scheduling
again. Metrics are rendering-only and available programmatically:

- FPS;
- render frame time;
- renderer queue depth;
- configured blend duration;
- active animation ID;
- dropped render frames.

These metrics are not displayed in production UI.

## Asset loading and cache

Animation clips remain lazy-loaded. Concurrent requests for one clip share the same promise.
The successful remote-clip cache uses least-recently-used ordering and is bounded to 128
entries. Failed requests are removed immediately so retries can succeed. Test and development
tools can clear the remote cache without affecting statically registered clips.

## Idle and interruption behavior

When no clip is active, the branded interpreter stays in a neutral signing posture with subtle
breathing, eye focus, periodic blink, and small head motion. On interruption, the outgoing
renderer’s live skeletal snapshot becomes the incoming blend source. At clip completion, the
final signing frame is rendered before a bounded transition returns the rig and expression to
neutral.

## Accuracy and fallback

The renderer does not generate signs, infer handshapes, or alter playback order. Only validated
clips and playback metadata drive motion. Existing native-review gates and failure behavior
remain in place. Unsupported or invalid assets continue through the existing error and fallback
path rather than producing fabricated animation.

## Validation

Automated coverage includes controller behavior, interruption-safe blending, independent hand
control, clip caching, render-loop metrics, metadata integration, fixed-length limbs during
blended secondary motion, existing rig constraints, renderer lifecycle, and production build
compatibility.

## Production runtime

Phase 6.4 wraps this unchanged rendering engine with a renderer supervisor, capability-aware
frame scheduler, bounded health monitor, resource policy, and asset-runtime coordinator. Standard
mode remains the default; reduced resource mode is explicit and changes only runtime cost.
Neither mode changes approved poses, motion plans, cue timestamps, playback order, or linguistic
output.

The production runtime supports current Chrome, Edge, Brave, and other Manifest V3 Chromium
builds. Missing optional telemetry or rendering capabilities are reported and degraded
independently. Detailed metrics remain developer-only.

See [Avatar Production Optimization and Release Readiness](AVATAR_PRODUCTION_READINESS.md) for
lifecycle, recovery, diagnostics, compatibility, deployment, and soak-test guidance.
