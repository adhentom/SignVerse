# Rive Renderer Evaluation

## Decision

Rive is feasible as a future `Renderer` implementation, but it is not adopted for rig version 6.0. The current SVG renderer already accepts the governed `AnimationClip` contract, runs inside the Manifest V3 content-script bundle, supports deterministic joint inspection, and requires no additional binary runtime.

Rive would require an authored and reviewed `.riv` artboard, bone-weighted artwork, a defined mapping from SignVerse joint rotations and non-manual markers to Rive data-binding inputs, and a self-hosted WebAssembly runtime. Adding only the runtime without that reviewed rig would increase complexity without improving current sign fidelity.

## Fit with the existing architecture

Rive provides bones, constraints, timelines, blend states, and state machines. A future `RiveAdapter` can implement the existing renderer lifecycle—mount, play, pause, seek, capture state, and dispose—without changing the playback queue or public APIs.

Required integration work:

1. Author the branded SignVerse interpreter and bone hierarchy in the Rive editor.
2. Define stable data-binding inputs for shoulder, elbow, wrist, finger, head, eye, eyebrow, and mouth motion.
3. Retarget `AnimationClip` frames to those inputs and verify timing against native-reviewed signs.
4. Self-host and preload the WASM file so playback does not depend on a CDN.
5. Validate the extension CSP for `wasm-unsafe-eval` and document the security decision.
6. Measure the runtime and memory impact against the SVG adapter before enabling it.

## Current constraints

- The official web runtime uses JavaScript plus WebAssembly.
- Rive documents a CSP requirement involving `wasm-unsafe-eval` for its WebAssembly bindings.
- The published January 2026 runtime sizes range from approximately 707 KB uncompressed for `canvas-lite` to more than 2 MB for `webgl2`, before the authored `.riv` asset.
- Rive animation quality depends on a carefully authored source rig; it cannot automatically repair incorrect pivots in an existing SVG.

References:

- https://rive.app/docs/runtimes/web/web-js
- https://rive.app/docs/runtimes/web/preloading-wasm
- https://rive.app/docs/runtimes/web/faq
- https://rive.app/docs/editor/constraints/constraints-overview
- https://rive.app/docs/editor/manipulating-shapes/bones
- https://rive.app/docs/runtimes/state-machines
- https://rive.app/docs/runtimes/runtime-sizes
