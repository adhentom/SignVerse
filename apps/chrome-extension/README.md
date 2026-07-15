# SignVerse AI Chrome Extension

This package contains the SignVerse Chrome extension. It uses Manifest V3, TypeScript, Vite, React, and Tailwind CSS.

The current implementation sends extracted content to the configured SignVerse FastAPI backend through the Manifest V3 background service worker. The backend may use its mock or OpenAI interpretation provider; no speech processing, translation, avatar, or animation is connected.

## Commands

Run from the repository root:

```text
npm install
cp apps/chrome-extension/.env.example apps/chrome-extension/.env.local
npm run typecheck
npm run build
```

Set `VITE_SIGNVERSE_BACKEND_URL` in `apps/chrome-extension/.env.local` before building. The unpacked extension is produced in `apps/chrome-extension/dist`.

The build derives `host_permissions` from that URL, so each environment grants network access only to its configured backend origin. If the variable is omitted, the extension builds without backend host access and displays a configuration error when interpretation is requested. `VITE_SIGNVERSE_BACKEND_TIMEOUT_MS` controls the request timeout and defaults to 10 seconds.

## Current communication flow

1. Chrome injects the packaged generic-web content script into HTTP and HTTPS pages.
2. The content script mounts the floating React widget inside an isolated Shadow DOM.
3. The content script normalizes website text or the current YouTube/Meet caption into a `ContentPacket`.
4. The content script sends a versioned, correlated interpretation request to the background service worker.
5. The service worker validates the packet and calls `POST /interpret` through the typed backend client.
6. The service worker validates and returns the interpretation response to the content script.
7. The widget renders interpretation loading, result, and failure states.

## Floating widget

The accessibility widget is draggable, collapsible, responsive, and honors reduced-motion preferences. It displays interpreter readiness, structured visible webpage text, and placeholder cards for Website, YouTube, and Google Meet modes.

Website extraction runs in the generic-web content adapter. It collects the page title plus visible semantic headings and paragraphs while excluding hidden content, scripts, styles, the SignVerse widget, and common advertisement containers. The normalized packet is sent only to the configured backend and is not persisted by the extension.

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

The session is stopped automatically when the content-script React effect unmounts. The adapter itself performs no network requests; current packets pass through the generic background-service integration and are not persisted by the extension.

## Google Meet live captions

On active `meet.google.com` session routes, the Google Meet adapter creates a local live-content session that:

- observes accessible live-caption regions and caption-control state;
- captures the meeting title, speaker, language, timestamp, and participant count when available;
- updates partial utterances in place and retains the last 10 completed speaker entries;
- preserves history through caption interruptions and meeting reconnects;
- emits unified `ContentPacket<GoogleMeetPacketMetadata>` values; and
- reports disabled captions, session entry, interruptions, and reconnect status to the widget.

Meet caption selectors are isolated from the session so DOM changes can be accommodated without changing packet or UI contracts. Caption content remains ephemeral in the extension and is sent to the configured backend for interpretation.

The background service worker owns backend configuration, timeout handling, network failures, response validation, and the `POST /interpret` call. It stores no durable state.
