# Privacy and Consent

## Baseline posture

- Interpretation is user-initiated and visibly active.
- Existing text and captions are preferred over capturing audio.
- Audio capture requires explicit, contextual consent.
- Raw audio is not retained by default.
- Collection, processing, retention, and deletion behavior must be documented before release.
- Extension permissions must be optional and narrowly scoped where possible.
- Meeting support requires additional platform-policy, participant-consent, and privacy review.

## Data classes to define before implementation

- Account and authentication data.
- Source text, captions, and audio.
- Transcripts, glosses, and generated playback manifests.
- User feedback and corrections.
- Operational telemetry and security audit events.

Retention schedules, lawful basis, regional requirements, vendor subprocessors, and incident procedures remain open decisions.

## Current integration limitation

The first end-to-end integration automatically submits available website text or settled live captions to the explicitly configured mock backend after the extension loads. The mock service does not persist content, but explicit in-widget activation and meeting-participant consent controls are still required before any production or user study release.
