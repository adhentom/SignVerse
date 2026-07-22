# Avatar Animation Engine

`AvatarAnimationEngine` uses the browser animation frame clock and SVG transforms. It has no new
runtime dependency.

## Motion model

- A clip contains duration and ordered normalized keyframes.
- Each keyframe contains poses for named rig parts.
- Translation, rotation, scale, and opacity interpolate between adjacent keyframes.
- The existing playback controller drives deterministic seek progress.
- Playback speed changes the clip clock without changing the queue.
- Idle breathing, subtle head motion, and blinking run only while motion is allowed.

## Blending

The existing two renderer layers cross-fade for 180 ms. The incoming renderer is mounted and sought
before it becomes visible, so MP4 and avatar clips can alternate without a blank frame. Reduced-motion
preference removes transitions and ambient movement.

## State and cleanup

Play, pause, resume, stop, seek, and dispose are idempotent. Pause/dispose cancel the active animation
frame. No timers, listeners, or animation loops survive renderer disposal.

## Adding a reviewed clip

Create an `AvatarClip`, register it by stable ID, and add that ID as `metadata.avatar_clip` on the
reviewed sign asset. Do not map generic gestures, inferred poses, or unreviewed animation to ISL glosses.
