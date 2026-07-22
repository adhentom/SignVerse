# SignVerse AnimationClip 1.1

> The public release contains no generated clips. This specification documents the format used by
> permission-gated local imports.

## Purpose

`AnimationClip.json` is a deterministic motion derivative of one validated MP4 in
`assets/signs/`. It does not create a sign, translate a gloss, or approve linguistic content.
Every clip is traceable to one source video by SHA-256. A clip is omitted when the extractor
cannot verify both a stable pose and signing-hand motion; the original MP4 remains the fallback.

## Canonical file

Each successful conversion writes `assets/signs/<token>/AnimationClip.json` with:

| Field | Meaning |
|---|---|
| `schema` | Always `signverse.animation-clip` |
| `schema_version` | Currently `1.1` |
| `id` | Versioned clip identity |
| `asset_id`, `token_id` | Existing governed asset identities |
| `duration` | Source duration in seconds |
| `source` | Filename, SHA-256, dimensions, FPS, and frame count |
| `extractor` | MediaPipe implementation, version, and timing policy |
| `quality` | Detection counts for pose, face, and both hands |
| `rig` | Hierarchy, fixed bone lengths, joint constraints, and solver identity |
| `frames` | One entry per decoded source frame |
| `keyframes` | Timed transforms for the SignVerse SVG rig |

Each frame contains `timestamp_ms`, normalized `offset`, raw `pose`, `face`, `left_hand`, and
`right_hand` landmarks, plus `avatar_pose`. Landmark coordinates are MediaPipe normalized image
coordinates. Missing detections remain empty; they are never replaced with invented landmarks.

`avatar_pose` contains joint-local rotations rather than MediaPipe image coordinates. Pose
landmarks are normalized to shoulder width, and the observed shoulder-to-elbow and elbow-to-wrist
directions drive a fixed-length articulated chain. This avoids choosing the wrong elbow branch when
perspective makes a wrist target unreachable. The canonical hierarchy is torso → shoulder → upper arm → forearm → wrist →
hand → MCP → PIP → DIP, plus torso → neck → head. Child joints inherit parent transforms, so hands cannot
detach from wrists and arm segments cannot change length. Translation and scale remain available
only for root motion and facial deformation; the runtime ignores those properties on bones. Rig
version 6.0 targets the separately authored commercial SignVerse interpreter with hidden clavicle bones, an anatomical shoulder silhouette, signing-readable hands, fixed 118/112-unit arm segments, explicit shoulder, elbow, wrist, neck, and hip pivots, MCP/PIP/DIP articulation for every finger, and independent thumb CMC articulation. Existing v5-retargeted clips remain compatible because the joint-local rotation keys and timing contract are unchanged. Projected shoulder rotations remain continuous across the ±180° image boundary, while local elbow, wrist, and finger rotations remain anatomically constrained and
temporally low-pass filtered. Offsets remain monotonic in `[0, 1]` and preserve source timing.

## Runtime projection

The extension copy under `public/animations/` contains provenance, quality, and `keyframes`, but
omits the large raw `frames` array. The canonical file remains the reusable landmark source.
`playback/animationAssets.json` maps existing `asset_id` values to runtime clips.

## Compatibility

Readers must reject unknown rig metadata, invalid durations, unordered offsets, non-finite
transforms, or fewer than two keyframes. Version 1.0 flat transforms remain readable for backward
compatibility, while newly generated clips use the 1.1 hierarchical rig. A future coordinate or
hierarchy change requires another schema version.
