# Sign Playback Engine

## Scope

The Sign Playback MVP turns a governed `InterpretationGloss` into an ordered asset schedule.
It demonstrates retrieval and planning for the hackathon; it does not generate motion, animate
an avatar, or establish that draft vocabulary or placeholder graphics are valid ISL signs.

```text
AI Interpretation
→ exact governed gloss resolution
→ lexicon validation and confidence adjustment
→ sign asset registry lookup
→ PlaybackPlanner
→ ordered PlaybackSequence
→ extension Sign Playback panel
```

## Sign asset registry

Assets live under `assets/signs/<token-id>/`. Each directory contains `metadata.json` and
exactly one supported asset file. The MVP file is `placeholder.svg`, clearly marked as a
non-linguistic placeholder.

Metadata binds a stable linguistic `token_id` to a separate `asset_id`, display label,
vocabulary category, review state, animation type, and version. The planner depends only on
metadata, not file paths or media formats. The registry recognizes placeholder, GIF, MP4,
Lottie JSON, GLB, and VRM types so storage can evolve without changing planning logic.

All current assets and lexicon entries are draft. They are suitable only for exercising the
MVP architecture and must not be presented as reviewed sign-language content.

## Planning

`PlaybackPlanner` accepts an ordered `InterpretationGloss`. For every token it:

1. preserves input order;
2. looks up an asset by stable token ID;
3. creates a playback item containing token ID, asset ID, duration, and governed confidence;
4. records tokens without a registered asset as unsupported.

The planner never opens media, changes meaning, chooses synonyms, or invokes AI. The initial
duration is a configurable fixed `1.2` seconds because placeholder metadata contains no reviewed
timing information.

## Governance integration

The playback service resolves provider gloss labels only by exact, case-insensitive canonical
gloss label. Unknown labels become explicit unknown tokens. The existing `GlossValidator` then
checks canonical token fields and applies confidence policy before planning.

Draft entries are recognized for coverage but confidence-blocked to `0.0`. This allows the MVP
to show that a placeholder asset match exists while making its unapproved status visible.
Unsupported linguistic tokens and governed tokens without registered assets are combined into
one stable, duplicate-free fallback list.

## Scheduling

`PlaybackSequence.items` is the schedule: array position is playback order and each item carries
its duration. The MVP does not include wall-clock start offsets, transitions, overlap, buffering,
pause/resume state, synchronization, or media preloading. Those belong in a future runtime
scheduler after real assets have reviewed timing metadata.

## Fallback strategy

- Unknown AI gloss label: emit an explicit unknown token and report it unsupported.
- Canonical mismatch or absent lexicon entry: do not schedule an asset.
- Draft or otherwise unapproved lexicon entry: retain the candidate match but set confidence to
  zero.
- Validated token without asset: report the governed token ID as unsupported.
- Empty or failed interpretation: return an empty playback sequence.

No fallback silently substitutes a related token, fingerspelling, or visually similar asset.
Those strategies require separate linguistic approval.

## Extension presentation

The widget's Sign Playback panel displays loading state, token order, asset ID, nominal duration,
confidence, and unsupported tokens. It renders the plan as accessible text only. The extension
does not fetch or execute registry assets in this milestone.

The `/interpret` response adds a `playback` object while preserving all existing fields. The
extension accepts responses without that field during rolling development and displays an empty
plan.

## Future avatar integration

A future playback runtime may resolve each `asset_id` to GIF, MP4, Lottie, GLB, or VRM content.
The renderer consumes `PlaybackSequence`; it must not reinterpret the source or select different
linguistic tokens. Format-specific adapters can implement loading, caching, transitions, and
avatar retargeting behind the asset boundary.

Before real playback is enabled:

- approve lexicon entries with native ISL reviewers;
- verify asset provenance, performer consent, and licenses;
- add asset-level linguistic and technical review states;
- record reviewed duration, transition, handedness, region, and non-manual metadata;
- test comprehension and sequencing with deaf ISL users; and
- define explicit behavior for low confidence, regional mismatch, and missing assets.
