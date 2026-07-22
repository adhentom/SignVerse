# SignVerse UI Review

## Scope

Audited the extension popup, sidebar, floating interpreter, interpretation cards, playback controls, avatar runtime, platform adapters, streaming state, and responsive CSS on commit `7184d4e`.

## Requirement status

| Requirement | Status | Evidence |
|---|---|---|
| Floating interpreter remains visible when sidebar closes | PASS | Interpreter is portaled to a persistent root and covered by a regression test. |
| Sidebar minimizes independently | PASS | The sidebar remains mounted for state continuity and uses `hidden`; the FAB restores it. |
| Remove duplicate overlay controls | PASS | Dock, expand, close, opacity, always-on-top, and scale controls were removed from the overlay. |
| Avatar is primary visual focus | PASS | Default stage increased to 300×440 with a dedicated avatar row. |
| Malayalam below avatar | PASS | Caption is in a separate scrollable region below the renderer. |
| Avatar selection and persistence | PASS | Existing `useAvatarPreference` storage path remains shared by sidebar and overlay selectors. |
| Multiple genuinely different avatar models | FAIL | Profiles currently tint/scale the same demonstration GLB; licensed model variants are not bundled. |
| Wikipedia responsive layout | PASS (automated) | Fixed overlay is viewport-clamped; production Chrome visual recheck remains required after rebuild. |
| YouTube and Google Meet visual verification | NOT VERIFIED | Live caption sources require active captions/meeting participants. |
| Mobile-sized window | PASS (CSS) | Overlay and sidebar use viewport bounds; browser visual recheck remains required. |

## Bugs fixed

1. Collapsing the sidebar unmounted `SignPlaybackPanel`, resetting the avatar and queue.
2. The overlay exposed two competing control surfaces and a close action that contradicted persistent accessibility behavior.
3. Malayalam text and playback controls overlaid the avatar at small sizes.

## Deliberate limitations

No backend, WebSocket, interpretation, lexicon, or planner behavior was redesigned. The renderer remains explicitly labelled as demonstration motion pending native ISL validation.
