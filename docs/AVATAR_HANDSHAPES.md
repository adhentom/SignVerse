# SignVerse Avatar Hand Shapes

> Historical local-validation note: the source-derived clips referenced below are excluded from
> the public repository pending redistribution permission and native ISL approval.

## Purpose

Rig 6.0 gives every finger explicit MCP, PIP, and DIP joints, plus an independent CMC joint for each
thumb. MediaPipe-derived clips drive the available joints directly. The reusable hand-shape library
is an additional deterministic control for governed
assets whose metadata names a reviewed configuration; it does not guess a hand shape from text.

## Configurations

The library defines `relaxed`, `open`, `flat`, `fist`, `point`, `curved`, `pinch`, `spread`, `index`,
and `thumb-up`. Each configuration contains sixteen local joint rotations per hand. The palm remains
attached to the wrist, every phalange inherits its parent's transform, and interpolation is handled
by the existing animation engine.

`source-derived` remains the default for converted assets. In that mode, MCP, PIP, and DIP rotations
for each finger come from the validated landmark clip. The thumb additionally derives CMC rotation
from the wrist-to-thumb-CMC landmark direction instead of collapsing opposition into its MCP joint.
Signed rotations remain available across `[-110°, 110°]` because a turning palm can reverse the
screen-plane direction without representing anatomical hyperextension. A named configuration is
applied only when a governed asset explicitly provides that supported name.

All 159 canonical production clips were deterministically retargeted to rig 6.0 from retained
landmarks. The result contains 5,012 keyframes with detected thumb CMC motion. Source MP4 files,
timing, hashes, provenance, and fallback behavior were not changed.

## Review boundary

These configurations are reusable rig poses, not independent claims that a pose represents an ISL
word. Gloss-to-asset mapping remains governed by the Asset Manager. Any configuration used in a
sign must be reviewed in its complete movement, orientation, location, and non-manual context by
qualified ISL reviewers.

## Extension

Add a configuration to `SIGNVERSE_HAND_SHAPES` and its fixed local rotations, then add regression
tests for all thirty-two finger joints. Do not add runtime inference, silently substitute a shape,
or bypass the validated MP4 fallback.
