# SignVerse AI Chrome Extension

This package contains the SignVerse Chrome extension. It uses Manifest V3, TypeScript, Vite, React, and Tailwind CSS.

The current implementation sends extracted content to the configured SignVerse FastAPI backend
through the Manifest V3 background service worker. The backend may use its mock or OpenAI
interpretation provider and returns Malayalam translation alongside the ISL interpretation.
Unmatched or unavailable glosses are reported explicitly.

When an authorized local MP4 has a validated source-derived landmark clip, the SVG renderer reproduces its
timed pose, hand, finger, and facial motion. Dataset recordings are never rendered as the
SignVerse character. Source-derived clips pending native review run only as a visibly labeled
animation preview; rejected, missing, invalid, or unloadable clips leave the branded avatar visible
and report `Sign unavailable`. The standalone MP4 adapter remains available only for explicit
diagnostic/reference tooling outside the public interpreter surface. See the
[AnimationClip specification](../../docs/ANIMATION_CLIP_SPEC.md) and
[video conversion pipeline](../../docs/VIDEO_LANDMARK_PIPELINE.md). The public repository ships
empty animation manifests because no third-party motion asset has completed the redistribution and
native-review gates.

## Commands

Run from the repository root:

```text
npm install
cp apps/chrome-extension/.env.example apps/chrome-extension/.env.local
npm run lint
npm run typecheck
npm test
npm run build
```

Set `VITE_SIGNVERSE_BACKEND_URL` in `apps/chrome-extension/.env.local` before building. The unpacked extension is produced in `apps/chrome-extension/dist`.

The build derives `host_permissions` from that URL, so each environment grants network access only to its configured backend origin. If the variable is omitted, the extension builds without backend host access and displays a configuration error when interpretation is requested. `VITE_SIGNVERSE_BACKEND_TIMEOUT_MS` controls the request timeout and defaults to 10 seconds.

## Current communication flow

1. Chrome injects the packaged generic-web content script into HTTP and HTTPS pages.
2. The content script detects the platform and mounts the floating React widget inside an isolated
   Shadow DOM without waiting for a popup action.
3. It immediately opens the backend streaming channel, requests backend health, and starts the
   platform source session.
4. The content script normalizes website text or the current YouTube/Meet caption into sentence-sized `ContentPacket` values.
5. A long-lived runtime port sends ordered packets to the background service worker.
6. The service worker validates packets and owns one reconnecting WebSocket to `/stream`.
7. The worker validates streamed responses and returns them to the content script in sequence.
8. The widget renders connectivity and interpretation state; validated playback plans start the
   avatar scheduler automatically.

The popup is a status-only surface. Generic websites, YouTube, and Google Meet all start through
the same content-script lifecycle and do not depend on the extension action.

Content is segmented before transport. Website paragraphs and stable live-caption sentences enter
an ordered request queue, and each validated response appends to the active Malayalam, gloss, and
playback output. Navigation cancels pending source work, while timestamp-only caption updates are
ignored. See [`docs/REALTIME_PIPELINE.md`](../../docs/REALTIME_PIPELINE.md).

Backend requests are made by the Manifest V3 service worker, so inspect its DevTools console and
Network panel from `chrome://extensions` rather than the webpage Network panel. Logs prefixed with
`[SignVerse]` identify service-worker startup, the resolved backend URL, request lifecycle, and
message-handler failures. Reloading an unpacked extension invalidates content scripts already
running in open tabs; SignVerse detects this state and asks the user to refresh the page before it
can reconnect to the new service worker.

## Accessibility sidebar

On first use, the popup explains page access, backend processing, optional YouTube tab-audio
capture, local settings, and SignVerse's content-retention behavior. Interpretation remains
disabled until the user completes this notice. The popup then provides an accessible per-site
enable/disable control and a domain exclusion list; excluding a domain also excludes its
subdomains. These preferences are stored in `chrome.storage.local`, and disabling a site stops
extraction, backend health and streaming connections, and tab-audio fallback on that site.

The extension renders a responsive, collapsible SignVerse sidebar inside an isolated Shadow DOM.
It includes connection and platform status, animated pipeline progress, skeleton loading,
collapsible interpretation cards, an interactive playback-plan console, and contextual source
content for websites, YouTube, and Google Meet. Connected, listening, caption, translation,
playback, and error indicators expose the active pipeline stage without relying on color alone.
Keyboard users can close it with Escape and
return through the focused floating action button.

On YouTube, the floating interpreter is mounted automatically. Its caption strip displays the
active official-caption or tab-audio packet immediately, then advances through caption segments
with the scheduled ISL signs once a playback plan arrives. The window uses an accessibility-first
reading order: synchronized caption, large avatar stage, then the current sign and sequence
position. A live status indicator distinguishes waiting, interpreting, playing, paused, and error
states. The interpreter can be dragged with a pointer or keyboard, resized responsively, minimized
while retaining its caption strip, closed, and restored. Position and border-box size are saved in
extension-local storage and clamped back into the viewport when the browser window changes.

The Malayalam Translation card is independently collapsible and scrollable, identifies its
content as Malayalam for assistive technology, and provides an accessible copy action with
success or failure feedback.

The interface uses visible focus states, semantic landmarks, ARIA live regions, high-contrast
and forced-colors media queries, and reduced-motion behavior. Backend failures distinguish offline, timeout,
configuration, unavailable, and invalid-response states and provide a local retry action.
Transcript-unavailable and permission-denied states are announced with actionable explanations.
Developer diagnostics are excluded from the normal UI. Local development builds may opt in with
`VITE_SIGNVERSE_ENABLE_DEVELOPER_CONTROLS=true`; production builds ignore that switch. In an
eligible development build, ISL diagnostics remain hidden inside the collapsed
**Advanced Developer** section until explicitly opened and enabled.

Website extraction runs in the generic-web content adapter and follows the user's reading context. A visible text selection has highest priority. Otherwise, the adapter resolves the nearest readable paragraph, heading, list item, caption, or article section at the current pointer, click, or caret position. Context changes are debounced for 400 ms and identical blocks are deduplicated, so moving within one paragraph does not produce repeated interpretations. Hidden content, scripts, styles, the SignVerse widget, and common advertisement containers are excluded. Only the localized normalized packet is sent to the configured backend; it is not persisted by the extension.

## Platform adapters

`AdapterFactory` detects the current URL and selects an ordered platform adapter:

- Generic websites — `Website Reading`
- YouTube and its subdomains — `YouTube Interpretation`
- Google Meet — `Google Meet Live`

Each adapter owns URL matching, platform metadata, and its content-extraction strategy. Specific adapters are registered before the generic fallback. Future Zoom, Microsoft Teams, PDF, or LMS support can be added by implementing the `PlatformAdapter` contract and registering it with the factory.

## YouTube live captions

On `youtube.com/watch` pages, the YouTube adapter creates a local live-content session that:

- reads official `.ytp-caption-segment` elements;
- detects caption availability and the subtitles-button state;
- observes caption, player, and metadata changes;
- listens for play, pause, seek, time, duration, and metadata events;
- handles advertisements, live streams, and YouTube SPA navigation;
- emits unified `ContentPacket<YouTubePacketMetadata>` values; and
- maintains a duplicate-free history of the last 10 captions.

The session starts automatically on YouTube watch pages and stops when the content-script React
effect unmounts. Current packets pass through the generic background-service integration and are
not persisted by the extension.

### Captions from tab audio

Official YouTube captions remain the preferred low-latency source. If no caption cue arrives within
`VITE_SIGNVERSE_CAPTION_TIMEOUT_MS` (2.5 seconds by default), the content script asks the service
worker to start `tabCapture`; no popup action is required. A Manifest V3 offscreen document records
short, self-contained audio segments while routing captured sound back to the speakers. The
configured backend transcribes each segment through `/transcribe`, and the content script converts
the result into the same YouTube `ContentPacket` used by official captions.

When official captions reappear, SignVerse immediately stops audio fallback, rejects late audio
responses, and returns caption packets to the interpretation pipeline. Normalized repeated
transcriptions are suppressed. Capture also stops when SignVerse unmounts, the captured track ends,
or transcription fails. Audio is sent only to the configured SignVerse backend and is not persisted
by the extension. The backend requires a configured speech-transcription provider.

## Google Meet live captions

On active `meet.google.com` session routes, the Google Meet adapter creates a local live-content session that:

- observes accessible live-caption regions and caption-control state;
- captures the meeting title, speaker, language, timestamp, and participant count when available;
- updates partial utterances in place and retains the last 10 completed speaker entries;
- preserves history through caption interruptions and meeting reconnects;
- emits unified `ContentPacket<GoogleMeetPacketMetadata>` values; and
- reports disabled captions, session entry, interruptions, and reconnect status to the widget.

Meet caption selectors are isolated from the session so DOM changes can be accommodated without changing packet or UI contracts. Caption content remains ephemeral in the extension and is sent to the configured backend for interpretation.

The background service worker owns backend configuration, WebSocket reconnection, unacknowledged-packet replay, response validation, and the backwards-compatible REST client. It stores no durable content.

## Avatar playback

The widget consumes the backend's governed playback order through a local scheduler and a
swappable renderer interface. It provides Lottie playback, an SVG-sequence adapter, a GLB adapter
boundary, cached loading and preloading, complete transport and speed controls, synchronized
English source captions, accessible keyboard operation, and explicit asset fallbacks. Malayalam
translation remains in the sidebar and never feeds the ISL playback path. Users can select a
persisted female or male interpreter; both share the same fixed-length hierarchical rig. Animation
clips remain pending until native ISL review is recorded. See
[`docs/TWO_AVATAR_INTERPRETER.md`](../../docs/TWO_AVATAR_INTERPRETER.md).

The scheduler is the single timing source for both the active avatar cue and highlighted English
caption segment. Caption words are distributed using the actual duration of each scheduled sign,
rather than equal-sized visual chunks. Playback begins automatically when a validated sequence
arrives. Sign changes use a bounded 120–500 ms cross-fade plus previous-pose interpolation;
reduced-motion users receive an immediate transition. The next asset is preloaded before its cue,
and streamed sequence appends do not restart completed signs. See
[`docs/CAPTION_ENGINE.md`](../../docs/CAPTION_ENGINE.md) for cue identity and timestamp semantics.

### Avatar production runtime

The avatar runtime targets current Chrome, Edge, Brave, and other Manifest V3 Chromium builds.
Capability detection falls back to a cancellable timer when animation frames are unavailable and
uses a labeled cache estimate when Chromium heap telemetry is unavailable. Missing WebGL affects
only optional WebGL renderers; the branded SVG interpreter remains the default.

The standard resource policy is the default. An embedding or controlled deployment may explicitly
select reduced resource mode to lower inactive-frame frequency, secondary motion, cache pressure,
and preload concurrency. It does not change sign motion, playback timestamps, or interpretation.
This is separate from the user's reduced-motion preference.

FPS distributions, dropped frames, memory estimates, asset cache/load metrics, renderer uptime,
and recovery counts are available programmatically for developer diagnostics only. They are not
shown in production UI and contain no caption or interpretation content. See
[`docs/AVATAR_PRODUCTION_READINESS.md`](../../docs/AVATAR_PRODUCTION_READINESS.md) for lifecycle,
compatibility, recovery, deployment, and soak-test guidance.
