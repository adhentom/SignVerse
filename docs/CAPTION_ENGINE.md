# Synchronized Caption Engine

The SignVerse caption engine keeps source captions, interpretation packets, and avatar playback on
one deterministic timeline.

## Source timing

YouTube packets retain the formatted player timestamp and add millisecond metadata:

- `playbackTimeMs` — player position when the cue was observed;
- `captionStartMs` and optional `captionEndMs` — cue boundaries;
- `captionSource` — `youtube-dom`, `youtube-track`, or `tab-audio`; and
- `cueId` — stable identity for partial updates to one cue.

Official transcript tracks provide exact start and end times. Visible YouTube captions use the
player position at the first partial update. Appended words retain the original cue identity and
replace the history entry in place. Seeking resets the active DOM cue.

Tab-audio messages include the recorded segment duration. The content script derives the audio
caption start from the current player position and records both boundaries. Adjacent normalized
duplicates are suppressed, while the same phrase can be accepted again after a later segment.

## Avatar synchronization

`CaptionTimeline` maps normalized caption words across the playback sequence using each sign's
actual duration. The avatar scheduler and caption UI therefore advance at the same sign boundary;
longer signs retain their associated caption text for longer.

The sidebar caption track scrolls the active segment into view. The floating caption uses a short
update transition and an atomic polite live region. Both smooth scrolling and transition motion
respect the user's reduced-motion preference.

## Validation

Focused tests cover:

- official DOM and transcript-track timestamps;
- partial cue replacement and bounded history;
- recorded audio timing;
- stable cue deduplication and later repeated speech;
- duration-weighted caption segmentation; and
- caption/avatar boundary alignment.

Run the complete extension gate from the repository root:

```bash
npm run check
```
