# SignVerse Avatar Asset Pipeline

## Scope

Phase 6.2 centralizes avatar asset discovery, validation, loading, reuse, and
lifecycle management. It does not change `PlaybackSequence`, playback timing,
the synchronization engine, interpretation, or animation behavior.

The renderer remains a consumer of the existing playback contract:

```text
PlaybackSequence
  -> Playback Scheduler
  -> RendererSession
  -> Avatar2DAdapter
  -> AvatarAssetManager
       -> manifest and metadata libraries
       -> visual asset provider
       -> validated animation clip cache
  -> AvatarAnimationEngine
  -> SVG rig
```

The adapter no longer creates avatar artwork or fetches animation clips
directly. The `AvatarAssetManager` supplies leased visual and animation assets.
Releasing a renderer releases both leases without disposing shared cached data.

## Files

- `apps/chrome-extension/playback/avatar/assets/avatar.manifest.json` — versioned
  avatar, rig, animation, renderer, capability, and library manifest.
- `animations.json` — reusable animation metadata.
- `handshapes.json` — stable public handshape IDs and renderer-specific aliases.
- `expressions.json` — metadata-driven non-manual expression profiles.
- `transitions.json` — transition duration, easing, and interpolation profiles.
- `AvatarAssetManager.ts` — discovery, loading, integrity, fallback, cache,
  diagnostics, and lifecycle service.
- `validateAvatarAssets.ts` — bundle and reference validator.
- `SvgAvatarAssetProvider.ts` — current SVG implementation of the abstract
  visual provider contract.
- `types.ts` — renderer-neutral asset interfaces.

The JSON libraries are bundled by Vite. Updating the versioned JSON assets does
not require renderer source changes, but an extension rebuild is required so
Chrome can load the new immutable package.

## Manifest and compatibility

The manifest has three independent versions:

- `avatarVersion` controls the public asset package.
- `rigVersion` must match the SignVerse skeletal rig.
- `animationVersion` controls animation metadata compatibility.

Unsupported major versions are rejected. If a configured package is invalid,
the manager records validation diagnostics and falls back to the built-in,
validated package. The current public release intentionally leaves
`animations.json` empty because redistributable reviewed sign clips are not
shipped. Authorized deployments can populate the same data file without
changing renderer code.

Each renderer declaration identifies a renderer kind, rig, supported profiles,
and fallback status. Providers implement the renderer-neutral
`AvatarAssetProvider` contract. Multiple providers of the same kind can coexist;
the manager selects the first provider whose `supports` predicate accepts the
manifest entry and profile. Future SVG, GLB, and VRM implementations can
therefore use the same manager contract.

## Animation metadata

Animation entries contain:

- stable `id`
- source
- duration
- blend and transition profiles
- expression profile
- required handshape
- version
- optional SHA-256 integrity
- optional fallback animation ID

The animation clip remains in the existing `AnimationClip` format. Library
metadata does not embed finger joint values in playback items. Instead,
playback references a handshape ID, which resolves to an existing renderer
handshape through `handshapes.json`.

## Validation

Package validation rejects:

- duplicate renderer, animation, handshape, expression, or transition IDs
- missing required fields
- unsupported manifest, animation, or rig versions
- unsupported renderer/profile/rig combinations
- invalid renderer handshape references
- missing handshape, expression, blend, transition, or fallback references
- ambiguous handshape aliases
- malformed integrity declarations
- circular animation fallbacks
- invalid easing or interpolation profiles
- missing default/fallback renderers

Runtime clip validation rejects non-JSON assets, invalid clip metadata, invalid
rig metadata, invalid keyframes, integrity mismatches, and library/clip ID or
duration mismatches. Invalid resources are removed from the cache and reported
without terminating the shared manager.

## Loading and cache lifecycle

Assets are lazy-loaded on first use. Concurrent requests for the same source
share one in-flight promise. In-flight and actively leased entries are pinned.
Released entries participate in least-recently-used eviction.

The default cache is bounded to 128 animation clips. Frequently used IDs listed
in the manifest can be preloaded. Preloading acquires and immediately releases
a lease, leaving one reusable cached clip without an active reference.

`cleanup()` removes released entries. `dispose()` invalidates late asynchronous
results, clears caches, releases provider resources, and rejects subsequent
loads. Visual leases remove their DOM roots on release.

For avatar-backed signs, the existing `AssetLoader` now delegates to the avatar
manager and does not fetch the original signer MP4 merely to mount the retargeted
SVG clip. Non-avatar formats continue through their existing loaders.

## Integrity

Animation metadata may contain either:

- a 64-character hexadecimal SHA-256 digest, or
- a `sha256-` Base64 Subresource Integrity value.

Integrity is checked before JSON parsing. A mismatch rejects the clip and
prevents cache insertion. Structural validation still runs when no digest is
provided.

## Diagnostics

Production diagnostics expose counts and health only:

- avatar version and status
- loaded and active asset counts
- cache size, capacity, hits, misses, and evictions
- average load time
- validation failure count
- missing resource count

Developer diagnostics additionally expose validation messages and missing
resource paths. Detailed paths and internal failure messages are omitted from
production diagnostics.

## Adding an asset package

1. Add or update the manifest and metadata JSON files.
2. Keep IDs stable across patch releases.
3. Increment the appropriate version when schema, rig, or animation semantics
   change.
4. Reference only declared handshape, expression, and transition IDs.
5. Add SHA-256 integrity for distributed clip files.
6. Ensure fallback graphs are acyclic.
7. Run the asset validation and rendering regression suites.
8. Rebuild the extension.

No asset should be marked production-ready without the existing native ISL
review process. The Asset Manager validates technical integrity, not linguistic
correctness.

## Production lifecycle policy

Phase 6.4 does not change the `AvatarAssetManager` contract. The
`AvatarRuntimeCoordinator` warms frequently used assets once per manager, decorates rendering
health with public cache/load diagnostics, and requests released-entry cleanup in reduced resource
mode. In-flight and actively leased entries remain pinned. Corrupted, integrity-invalid, and
failed entries are excluded from reuse so a later valid request can retry.

Standard mode is the default. Reduced resource mode is opt-in and lowers generic cache pressure
and preload concurrency without changing animation content, playback timing, or sign semantics.
Memory telemetry is labeled as either Chromium performance data or an approximate cache estimate.

See [Avatar Production Optimization and Release Readiness](AVATAR_PRODUCTION_READINESS.md) for
cache tuning, renderer warm-up, failure recovery, deployment checks, and long-session validation.
