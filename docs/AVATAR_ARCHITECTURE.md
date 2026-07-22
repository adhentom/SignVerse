# Avatar Architecture

## Management model

Avatar identity is presentation-only and remains separate from linguistic tokens and animation
clips. Six profiles are registered as data:

- Adult Female
- Adult Male
- Teen Girl
- Teen Boy
- Neutral Assistant
- Robot

The selected stable ID and per-avatar scale are stored in `chrome.storage.local`. Adding a future avatar requires one
registry entry and compatible model asset; interpretation and playback planning do not change.

## Floating interpreter

The floating interpreter is independent of the results sidebar. It exposes the current avatar,
Malayalam sentence, playback state and progress, connection state, profile selection, opacity,
close/restore, minimize, expand, drag, resize, left/right dock, and viewport clamping. Position and
size persist locally. Its fixed maximum z-index provides always-on-top behavior within the page.
The sidebar independently remembers its collapsed state.

Keyboard users can operate every button and move the interpreter with arrow keys. Reduced-motion,
high-contrast, focus, and screen-reader behavior reuse the established accessibility layer.

## Renderer boundary

Lottie, SVG sequences, GLB, and VRM remain behind the existing renderer interface. Renderer
lifecycle is mount, play, pause, seek, and destroy. Asset changes destroy the previous renderer;
late loads cannot restart an orphaned animation loop. The loader caches assets and preloads the
next scheduled clip.

Current models and motion are demonstrations only. They do not include validated ISL handshape,
finger articulation, orientation, or non-manual facial markers.

The dataset boundary defines independently testable `GlossLibrary`, `AnimationRegistry`,
`MotionDatabase`, and `SignerProfile` contracts. An `AvatarRigController` reserves explicit hooks
for articulated finger joints, arm targets and constraints, wrist/shoulder motion, head target,
eye gaze and blink, facial expressions, mouth cues, and breathing. These hooks contain no
procedural sign motion and remain dormant until reviewed animation or rig data is available.

## Future reviewed avatars

Reviewed animation clips may be retargeted to compatible GLB/VRM skeletons. Production acceptance
requires stable bone naming, finger joints, facial blendshapes, transition testing, performer
consent, license provenance, regional ISL review, and comprehension evaluation with deaf users.
