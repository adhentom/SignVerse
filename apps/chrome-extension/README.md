# SignVerse AI Chrome Extension

This package contains the Phase 1 Chrome extension foundation. It uses Manifest V3, TypeScript, Vite, React, and Tailwind CSS.

The current implementation is intentionally local-only. It does not include backend communication, AI, speech processing, language models, ISL generation, or external API calls.

## Commands

Run from the repository root:

```text
npm install
npm run typecheck
npm run build
```

The unpacked extension is produced in `apps/chrome-extension/dist`.

## Current communication flow

1. Chrome injects the packaged generic-web content script into HTTP and HTTPS pages.
2. The content script mounts the floating React widget inside an isolated Shadow DOM.
3. The popup sends a versioned, correlated message to the content script on the active tab.
4. The content script validates the message and responds with local mock state.

## Floating widget

The accessibility widget is draggable, collapsible, responsive, and honors reduced-motion preferences. It displays interpreter readiness, structured visible webpage text, and placeholder cards for Website, YouTube, and Google Meet modes.

Website extraction runs locally in the generic-web content adapter. It collects the page title plus visible semantic headings and paragraphs while excluding hidden content, scripts, styles, the SignVerse widget, and common advertisement containers. Extracted content is not stored or sent to an external service.

## Platform adapters

`AdapterFactory` detects the current URL and selects an ordered platform adapter:

- Generic websites — `Website Reading`
- YouTube and its subdomains — `YouTube Interpretation`
- Google Meet — `Google Meet Live`

Each adapter owns URL matching, platform metadata, and its content-extraction strategy. Specific adapters are registered before the generic fallback. Future Zoom, Microsoft Teams, PDF, or LMS support can be added by implementing the `PlatformAdapter` contract and registering it with the factory.

The background service worker handles extension lifecycle events and content-script readiness notifications. It stores no durable in-memory state.
