# Two-Avatar ISL Interpreter

## Data flow

SignVerse analyzes the English source once. The validated semantic representation then feeds two
independent realizations: natural Malayalam for the sidebar and governed ISL gloss for playback.
Malayalam text is never used as an input to gloss generation, asset lookup, or animation.

The floating interpreter shows the current English source alongside the active governed gloss.
Malayalam remains in the independently scrollable and copyable sidebar card.

## Character system

The extension exposes two adult professional interpreter profiles:

- `adult-female` using `signverse-female-v1`
- `adult-male` using `signverse-male-v1`

Both use `signverse-hierarchical-svg-v2`. Their artwork differs, but joint names, pivots, bone
lengths, facial controls, hand hierarchy, and animation-clip contract are identical. Switching
profiles therefore replaces artwork without resetting or translating the playback sequence.

The selected profile is stored in `chrome.storage.local` under `signverse.avatarProfile`.
Legacy female, neutral, and robot selections migrate to the female interpreter; legacy male
selections migrate to the male interpreter.

## Native ISL review gate

Generated landmark clips are engineering artifacts, not automatic linguistic approval. Every
asset receives a native-review record with these fields:

- `status`: `pending`, `approved`, or `rejected`
- `reviewer`: the accountable ISL reviewer
- `reviewed_at`: the review date
- `notes`: handshape, orientation, movement, location, timing, and non-manual findings

Reviewer decisions belong in `apps/chrome-extension/playback/nativeReviewRegistry.json`. An
animation is approved for production only when its status is `approved` and reviewer/date are
present. Pending source-derived clips may run as an explicitly labeled engineering preview; they
are never described as reviewed ISL. Rejected clips do not play. No review state substitutes a
dataset signer recording into the branded interpreter, and missing clips report `Sign unavailable`.

## Review checklist

For each clip and both character skins, the reviewer verifies handshape, palm orientation,
movement path, signing location, timing, two-hand relationship, facial grammar, and transitions.
Engineering checks additionally verify finite transforms, the parent-child hierarchy, fixed arm
lengths, clip parsing, unavailable-sign behavior, profile persistence, and reduced-motion behavior.

## Coverage limitation

The two avatars can reproduce the project's validated animation vocabulary. They do not imply
universal ISL coverage. Unknown or rejected concepts remain explicit and are never converted into
invented gestures.
