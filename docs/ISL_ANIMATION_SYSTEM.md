# ISL Animation System

## Consistent interpreter

The branded SignVerse SVG character is the primary interpreter. Dataset videos are never rendered as the primary interpreter: they are source evidence for validated vocabulary, timing, landmarks, and retargeted motion. A validated MP4 remains a technical fallback only when its generated avatar clip cannot load.

## Skeletal contract (rig 6.0)

Rig 6.0 is a completely new gender-neutral branded interpreter designed around the upper signing space. Its hierarchy is body → torso/pelvis; torso → hidden clavicles → shoulders → upper arms → elbows → forearms → wrists → hands; every palm → finger MCP joints → PIP joints → DIP joints; each thumb additionally begins at a CMC joint; torso → neck → head; and pelvis → hips. Shoulder pivots are symmetric around the torso, arm segments have fixed 118/112-unit lengths, and every visual child is nested under its parent joint.

Animation clips supply joint-local rotations; clips cannot translate arm bones or change their lengths. Retargeting preserves both source arm-segment directions instead of forcing an unreliable projected wrist target. Each MediaPipe finger chain is converted into MCP, PIP, and DIP local rotations instead of a single rigid finger direction. Shoulder-line tilt drives hidden clavicle rotations, while compensated upper-arm rotations preserve source motion. Shoulder directions are unwrapped continuously across the image angle boundary; elbow, wrist, and finger rotations retain anatomical limits. Visibility filtering rejects unreliable pose points while preserving the other tracked arm.

## Hand shapes and expression

The runtime exposes reusable open, flat, fist, point, curved, pinch, spread, index, and thumb-up configurations. A governed asset may request one by name; source-derived clips continue to use their extracted finger rotations. Facial controls provide neutral, happy, question, emphasis, negation, surprise, and sad states, with independent pupils and eyelid scaling for gaze and smooth blinking. Non-manual markers select these controls without changing the interpretation or playback contracts.

## Continuous playback

Each playback item carries its phrase ID and transition duration. Before mounting a new clip, the renderer captures the outgoing skeletal pose. During the initial portion of the new clip it interpolates from that pose into the target motion. Phrase-internal transitions are shorter than phrase-boundary transitions. The next asset is preloaded and renderer layers cross-fade without clearing the queue.

Non-manual markers are applied after skeletal blending so question, negation, gaze, emphasis, and emotion remain visible at the beginning of a sign. Idle breathing, blinking, and subtle head motion run only when reduced motion is not requested.

## Safety and limitations

- Missing clips fall back to the validated MP4 associated with the same asset.
- Missing governed assets display a subtitle fallback; no synthetic sign is fabricated.
- Landmark-derived motion is constrained to the SignVerse rig and does not reproduce the dataset signer’s appearance.
- Finger articulation quality is bounded by source resolution and landmark quality.
- Co-articulation is geometric. It must be evaluated for linguistic intelligibility with native ISL reviewers.
