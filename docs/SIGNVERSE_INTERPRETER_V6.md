# SignVerse Commercial Interpreter v6

## Design objective

Rig 6.0 is a completely new, project-authored vector character. None of the rejected v5 body,
limb, hand, face, clothing, or silhouette artwork is reused. The character is a gender-neutral,
high-contrast accessibility assistant designed around the signing space. Hands and wrists remain
visible against a dark teal uniform, while the face uses restrained outlines and large readable
eyes for non-manual grammar.

The artwork is original to SignVerse. It contains no dataset signer, recorded human image, external
avatar, generated human face, or third-party character asset.

## Anatomical construction

The 600 × 700 coordinate space uses a 296-unit shoulder span, 118-unit upper arms, 112-unit
forearms, a 34-unit neck, and a 128-unit face width. The torso tapers from the shoulder girdle to the
waist instead of using a rectangular or capsule silhouette. Upper arms and forearms use separate
tapered muscle/sleeve shapes, visible elbow joints, wrist cuffs, palms, and segmented fingers.

The skeleton is strictly nested:

`body → torso → clavicle → upper arm → forearm → hand → finger joints`

`body → torso → neck → head → facial controls`

`body → pelvis → hips`

Every finger owns MCP, PIP, and DIP transforms. Each thumb additionally owns a CMC transform, so
thumb opposition can be animated independently. Clips may rotate joints but cannot translate or
scale skeletal bones, preserving connection and fixed lengths at runtime.

## Motion and expression

The unchanged `AvatarAnimationEngine` provides smoother-step keyframe interpolation, previous-pose
blending, co-articulation between queued signs, breathing, blinking, gaze, head motion, torso lean,
wrist motion, and non-manual markers. Facial states include neutral, smile, question, emphasis,
surprise, negation, concentration, and sadness.

MediaPipe-derived clips continue to provide local joint rotations. The renderer never places SVG
limbs at landmark coordinates. Existing governed clips and timing remain unchanged.

## Visual verification

The local visual-regression workflow renders a contact sheet for the interpreter states. Generated
screenshots are intentionally not committed; the workflow covers an
idle pose plus real `HELLO` and `COMPUTER` animation frames. Three visual passes corrected arm paint
order, finger readability, torso proportions, and an exposed clavicle guide. Automated tests also
assert hierarchy, fixed arm lengths, thumb inheritance, joint-only transforms, expressions, and MP4
fallback.

A Chromium stress pass applied 600 random-access pose updates to the articulated `COMPUTER` clip in
57.5 ms (0.096 ms per update on the development machine), comfortably below the 16.67 ms transform
budget for 60 FPS. This measures SVG pose projection rather than end-to-end interpretation latency.
