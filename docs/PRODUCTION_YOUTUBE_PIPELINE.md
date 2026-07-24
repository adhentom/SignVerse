# Production YouTube Accessibility Pipeline

This document describes the automatic local YouTube experience implemented by the SignVerse
Chrome extension. It defines component ownership, precedence rules, operational signals, and the
quality gate for changes to this flow.

## Runtime flow

1. The YouTube content script starts automatically on a watch page and observes player metadata
   and official caption cues.
2. Official captions are converted directly to `ContentPacket` objects. They are always preferred
   because they have the lowest latency and the strongest timing information.
3. If no caption cue is available for 2.5 seconds (configurable with
   `VITE_SIGNVERSE_CAPTION_TIMEOUT_MS`), `YouTubeAudioFallback` asks the background service worker
   to begin tab capture.
4. The background worker obtains the tab media stream and delegates recording to the offscreen
   document. Two-second audio segments are sent to `POST /transcribe`.
5. `transcriptionClient.ts` validates the network, HTTP, JSON, and non-empty-text boundaries.
   Successful transcripts return to the content script through typed runtime messages.
6. `audioTranscript.ts` creates the same `ContentPacket` contract used by official captions, with
   `metadata.transcriptionSource` set to `tab-audio`.
7. `StreamingPortClient` sends packets to the background worker. The worker owns WebSocket and
   bounded REST communication with the FastAPI interpretation service.
8. Playback items from the interpretation response enter `AnimationScheduler`. The floating
   caption track and avatar use the same active playback index, keeping the displayed phrase
   aligned with its sign.
9. When an official caption appears, tab capture stops immediately. Late audio responses and
   duplicate transcript text are rejected.

## User interface

The floating interpreter opens automatically for YouTube interpretation. It provides:

- an English source caption synchronized to the active sign;
- the SignVerse avatar and playback status;
- smooth, bounded transitions between sign poses;
- minimize, restore, close, drag, and resize controls; and
- keyboard and screen-reader semantics.

Mock-provider and playback-debug controls are compiled into development builds only when
`VITE_SIGNVERSE_ENABLE_DEVELOPER_CONTROLS=true`. They are not visible in the normal production UI.

## Structured diagnostics

The extension emits the following stable events to the browser console:

- `caption_available`
- `caption_timeout`
- `audio_fallback_started`
- `transcription_received`
- `content_packet_created`
- `packet_sent`

Capture and transcription failures also emit `audio_capture_failed`,
`audio_transcription_failed`, or `audio_fallback_failed` with a bounded user-facing status.

## Configuration

The extension build reads:

- `VITE_SIGNVERSE_BACKEND_URL`: FastAPI origin, for example `http://127.0.0.1:8000`;
- `VITE_SIGNVERSE_BACKEND_TIMEOUT_MS`: request timeout; and
- `VITE_SIGNVERSE_CAPTION_TIMEOUT_MS`: delay before starting audio fallback, with a 500 ms minimum.

The backend must allow the installed `chrome-extension://<extension-id>` origin and have a
transcription provider configured. Tab audio is sent only while official cues are unavailable.
SignVerse does not persist recorded audio in the extension.

## Quality gate

Run the complete extension gate from the repository root:

```bash
npm run check
```

This runs lint, TypeScript typechecking, the Vitest suite, and both Vite production builds.
The integration suite covers caption precedence, timeout-based capture, transcript-to-packet
conversion, streaming dispatch, interpretation receipt, synchronized caption/avatar scheduling,
late-caption takeover, transcription failures, and duplicate prevention.

The public production release remains gated on native-ISL review, Deaf-community comprehension
testing, a privacy assessment, supported-browser fixture testing, and signed packaging.
