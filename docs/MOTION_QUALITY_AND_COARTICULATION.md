# Motion Quality and Co-articulation

## Scope

Phase 6.3 improves continuity between approved ISL animations without changing their
linguistic meaning. It is a renderer-layer refinement: the existing
`PlaybackSequence`, approved animation clip, handshape metadata, and transition metadata
remain authoritative.

This phase does not change:

- caption extraction or synchronization;
- interpretation, providers, prompts, or gloss generation;
- vocabulary governance or dataset import;
- the playback scheduler or `PlaybackSequence` contract;
- avatar asset discovery, validation, review gates, or cache ownership;
- the overlay, popup, permissions, or onboarding.

The motion layer cannot create a sign, reorder signs, substitute vocabulary, or approve an
animation. Missing or rejected assets continue through the established fallback path.

## Architecture

```text
Existing PlaybackSequence
  -> Existing playback scheduler
  -> Avatar2DAdapter
       -> AvatarAssetManager lease and approved animation metadata
       -> AvatarAnimationEngine
            -> AnimationController
                 samples the approved clip
            -> HandController
                 fills only joints absent from the approved clip
            -> MotionPlanner
                 creates a deterministic transition plan
            -> TrajectoryGenerator
                 samples a cached curved joint trajectory
            -> CoArticulationController
                 blends the outgoing pose into the incoming sign
            -> WristFingerRefinementController
                 stabilizes wrist and digit rotations
            -> SecondaryMotionController
                 adds bounded follow-through and stabilization
            -> ExpressionController
                 applies approved non-manual metadata
            -> RigController
                 applies local rotations to the fixed-length hierarchy
            -> RenderLoop
                 drives the SVG rig and renderer-only diagnostics
```

Motion code lives in
`apps/chrome-extension/playback/avatar/motion/`. Rendering integration remains behind
`AvatarAnimationEngine` and `Avatar2DAdapter`; upstream systems do not depend on motion
controller implementations.

## Deterministic Motion Planning

`MotionPlanner` receives:

- a captured outgoing avatar pose;
- the first pose of the incoming approved clip;
- current and previous animation IDs;
- the existing requested transition duration, when supplied;
- approved transition metadata;
- a selected motion profile; and
- reduced-motion state.

It produces an immutable `MotionPlan` containing transition duration, path length,
transition profile, repeated-sign status, abrupt-direction count, and a renderer-only
transition-quality estimate.

The planner is deterministic. The same inputs produce the same plan, and no random movement
is introduced. A requested transition duration remains authoritative within the motion
profile's safe bound and is capped to 45% of the current cue interval so the approved sign
can reach its target before the scheduler advances. When no duration is supplied, the
planner estimates one from path length and abrupt direction changes. Repeated signs receive
a shortened transition so the sequence remains perceptible without an unnecessary stop at
neutral.

The transition-quality value measures geometric continuity only. It is not an ISL accuracy,
translation, review, or interpretation confidence score.

## Co-articulation

`CoArticulationController` owns the short-lived state between two approved signs.

At a renderer hand-off it:

1. captures the outgoing rig pose;
2. waits until the incoming clip can provide its target pose;
3. requests a deterministic plan and trajectory;
4. advances the curved transition on the render clock;
5. follows the evolving incoming clip during the final portion of the transition; and
6. resolves exactly to the approved target pose.

Following the live target near the end prevents transition planning from freezing the
incoming sign at its first frame. Exact endpoint resolution preserves the approved sign's
handshape, orientation, signing location, and timing. Interruption replaces stale transition
state with a transition from the currently rendered pose, so playback does not snap back to
an earlier sign or to neutral.

Co-articulation is intentionally local to the renderer. It does not consume future captions,
change queue order, or move playback timestamps.

## Trajectory Generation

`TrajectoryGenerator` replaces point-to-point rotational snapping with bounded cubic
Bézier trajectories. It uses:

- shortest-path angle interpolation;
- smoother-step time progression;
- profile-specific anticipation, follow-through, and curvature;
- different curvature weights for arms, wrists, and fingers; and
- optional interpolation for translation, scale, and opacity values already present in a
  clip.

Validated transition-library definitions are resolved through `AvatarAssetManager` before
planning. Their duration and interpolation profile take precedence over unvalidated
per-asset hints, while a `PlaybackItem.transition_ms` remains the explicit timing override.

Because the avatar uses a parent-child skeletal hierarchy with fixed bone lengths, smooth
local shoulder, elbow, forearm, and wrist rotations produce curved spatial hand paths while
keeping every limb connected. The trajectory generator does not translate detached SVG body
parts or apply MediaPipe coordinates directly.

The source and destination poses are reproduced exactly at progress `0` and `1`. Curvature
exists only between those endpoints and therefore cannot alter the approved terminal pose.
Shortest-path interpolation also prevents a wrist near the `-180/180` degree boundary from
rotating the long way around.

## Wrist and Finger Refinement

`WristFingerRefinementController` applies a shared, time-based response to:

- left and right wrist rotations;
- thumb CMC/MCP/PIP/DIP joints; and
- index, middle, ring, and little finger MCP/PIP/DIP joints.

It is seeded from the outgoing pose, uses shortest-angle interpolation, and applies the same
frame response to both hands. This avoids unilateral lag when a two-handed sign changes
handshape. Terminal frames bypass temporal filtering and resolve to the clip values exactly.
Reduced-motion mode also resolves immediately.

Approved clip articulation has priority. `HandController` uses reusable handshape definitions
only to fill joints that are absent from the clip; it does not overwrite joint rotations
already supplied by an approved animation.

## Continuous Clip Sampling

`AnimationController` samples approved keyframes with monotone cubic Hermite interpolation
across adjacent frames. Tangent limiting prevents reversals or overshoot outside the two
approved keyframe values, binary-search frame selection keeps sampling cost bounded, and
shortest-path angular interpolation avoids wraparound. Sparse joints remain neutral until
their first governed keyframe. Optional scale, opacity, and translation properties remain
optional rather than receiving artificial defaults.

The interpolation changes only the continuous path between existing keyframes. It preserves
clip timing, the original keyframes, playback-rate limits, and seek semantics.

## Secondary Motion

`SecondaryMotionController` observes arm movement and adds deliberately small local offsets:

- clavicle follow-through;
- torso counter-rotation for stabilization;
- head inertia when the approved clip does not drive the head; and
- continuity with the rig's existing breathing and blink behavior.

The controller uses smoothed angular velocity rather than frame-to-frame noise. Offsets are
strictly bounded and scaled by the selected motion profile. Approved arm, wrist, finger, and
head values remain primary, so secondary motion cannot replace or contradict sign movement.

## Timing and Playback Boundaries

Phase 6.3 respects the existing playback clock:

- sign duration and timestamps remain unchanged;
- speed changes scale both clip progress and co-articulation progress from `0.25×` to `2×`;
- transitions are bounded to the current cue interval;
- seek cancels stale interpolation before sampling the requested clip position;
- interruption begins from the currently visible pose;
- a final approved pose is presented before idle recovery; and
- transitions fit within configured motion-profile bounds.

The renderer may smooth motion inside the available transition interval, but it cannot delay
the scheduler, buffer additional signs, or change a `PlaybackSequence`.

## Idle Recovery

Pause, stop, or the end of an active sequence begins a bounded transition from the current
pose to the rig's neutral signing posture. The recovery does not reset the avatar abruptly.
The render loop may continue the non-linguistic idle layer so breathing, gaze, and blinking
remain natural while clip time is paused.

Idle recovery preserves:

- the last valid gaze until the expression layer resolves it;
- fixed bone lengths and connected joints;
- the neutral signing posture defined by the rig; and
- reduced-motion behavior, which resolves without temporal animation.

Starting or resuming a sign interrupts recovery from the currently visible pose instead of
from a stale neutral snapshot.

## Motion Profiles

Profiles tune presentation characteristics without changing linguistic content or approved
clip data.

| Profile | Intended use | Motion characteristics |
| --- | --- | --- |
| `precise` | Default and reviewed content | Conservative curvature, high velocity smoothing, restrained secondary motion |
| `conversational` | Live captions and dialogue | Shorter transitions, moderate anticipation, responsive follow-through |
| `expressive` | Content with approved emphasis metadata | Stronger but bounded curvature and secondary motion |
| `educational` | Deliberate instructional pacing | Longer transitions, highest smoothing, minimal secondary movement |

Approved asset metadata may select a profile or transition hint. Unknown values resolve to
`precise`. Legacy transition names map to compatible profiles without changing asset or
playback contracts:

- `fast` and `directional` map to `conversational`;
- `emphasis` maps to `expressive`;
- `slow` maps to `educational`; and
- `default` and `reviewed` map to `precise`.

Reduced-motion mode disables temporal transition animation regardless of profile.

## Renderer Diagnostics

Motion diagnostics are developer-only and supplement the existing FPS and render-loop
metrics:

- transition quality;
- planned path length;
- blend utilization;
- average transition duration;
- co-articulation usage count;
- repeated-sign transition count;
- wrist/finger refinement sample count;
- active motion and transition profiles;
- trajectory cache hits, misses, and evictions;
- generated and sampled trajectory counts; and
- number of smoothed joints.

Diagnostics contain no captions, translations, gloss content, participant data, or page
content. They are not displayed in production UI and do not influence scheduling or
interpretation.

## Cache and Performance

Trajectory generation uses a shared bounded least-recently-used cache. Keys are based on the
animation ID, motion profile, transition profile, and exact source and destination poses.
This permits reuse for common transitions while preventing unbounded growth during long
sessions.

Current performance safeguards include:

- a maximum of 128 shared trajectory entries;
- deterministic pose signatures;
- renderer-session-scoped cache and smoothing diagnostics;
- binary-search keyframe sampling;
- no per-frame asset loading;
- lazy trajectory construction only when a target pose is available;
- precomputed Bézier control points and a reusable trajectory sample buffer;
- cached neutral poses, handshape entries, expressions, and render-state storage;
- bounded elapsed-time and interpolation values;
- one renderer-owned animation frame loop;
- explicit controller reset/disposal; and
- finite-value and joint-bound validation in regression tests.

The motion cache contains derived numeric trajectories only. Asset data and lifecycle
ownership remain with `AvatarAssetManager`.

## Validation

Phase 6.3 automated coverage is designed to verify:

- deterministic motion planning and all four profiles;
- repeated-sign transitions and abrupt direction changes;
- exact trajectory endpoints and curved intermediate samples;
- shortest-path wrist interpolation;
- stable thumb and finger transitions;
- bilateral hand synchronization;
- interruption from the live rendered pose;
- pause, resume, seek, and idle recovery;
- fixed bone lengths and connected joints throughout transitions;
- finite transforms and valid SVG bounds;
- unchanged approved handshape definitions and clip semantics;
- bounded trajectory cache behavior and diagnostics;
- reduced-motion behavior;
- renderer lifecycle cleanup; and
- compatibility with existing rendering regression and integration suites.

Repository validation must include ESLint, strict TypeScript type checking, all unit and
integration tests, rendering and motion regression tests, and the production Vite build.

## Limitations and Review Boundary

- Co-articulation improves continuity but cannot repair an anatomically invalid or
  linguistically incorrect source clip.
- Transition quality is a geometric heuristic, not native ISL review.
- The controller does not infer classifier constructions, facial grammar, or handshapes.
- Secondary motion remains deliberately subtle because excessive embellishment can change
  sign readability.
- Reduced-motion mode favors immediate pose changes over continuous transitions.
- Visual regression and numerical rig tests cannot certify linguistic correctness.
- The current approved-animation manifest is empty, so exhaustive library playback validation
  will begin when reviewed animation entries are published through the Phase 6.2 asset pipeline.
- Some animation-keyframe and expression composition paths still create small frame-local
  objects. The trajectory hot path now reuses its sample buffer; broader pooling should be
  considered only after profiling simultaneous renderers.

Native ISL reviewer approval remains the release gate for each sign. Phase 6.3 preserves that
governance boundary while making already approved motion flow more naturally.

## Phase 6.4 Optimization Boundary

Production runtime optimization surrounds this motion layer without changing it. Adaptive
inactive rendering, renderer recovery, cache tuning, browser fallbacks, and reduced resource mode
do not alter a `MotionPlan`, approved keyframe, transition endpoint, handshape, cue timestamp,
playback rate, or linguistic output. Reduced resource mode may scale only bounded secondary motion;
sign-defining joint motion remains authoritative.

Health statistics describe renderer performance, not transition or ISL correctness. See
[Avatar Production Optimization and Release Readiness](AVATAR_PRODUCTION_READINESS.md).
