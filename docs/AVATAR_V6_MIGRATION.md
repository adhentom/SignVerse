# Avatar Rig 6.0 Migration

## Unchanged boundaries

`RendererFactory`, `RendererSession`, `Avatar2DAdapter`, `AvatarAnimationEngine`, the playback queue,
Asset Manager, animation clip schema, backend, and extension message contracts are unchanged.
`Avatar2DAdapter` now instantiates `createSignVerseInterpreterSvg()`, and the engine delegates local
skeletal transforms to `SignVerseSkeletalRig`.

## Replacement boundary

The retired `professionalInterpreter/` package was deleted rather than patched. Its replacement is
the independent `signVerseInterpreter/` package containing new artwork, geometry, skeleton, hand
configurations, and expression definitions.

Existing v5-retargeted clips remain readable because their shoulder, elbow, wrist, head, and
MCP/PIP/DIP keys use the unchanged joint-local rotation contract. Production clips have now been
retargeted to rig 6.0 from retained landmarks so thumb CMC opposition is source-derived. When an
older clip does not contain CMC data, the reviewed rest angle or governed hand-shape pose is used.
No source video, clip timing, asset registry entry, or API payload requires migration.

If a clip cannot load or validate, `Avatar2DAdapter` preserves the existing governed MP4 fallback.

## Rive decision

Rive remains a viable future renderer implementation, but adopting its WebAssembly runtime without
an authored and native-reviewed `.riv` rig would not improve sign fidelity. The SVG implementation
already meets the current clip contract, supports deterministic joint inspection, and avoids new
Manifest V3 CSP and bundle-size costs. A future Rive adapter can still implement the existing
`Renderer` interface without changing playback.
