# SignVerse AI Chrome Extension

This package contains the Phase 1 Chrome extension foundation. It uses Manifest V3, TypeScript, Vite, React, and Tailwind CSS.

The current implementation is intentionally mock-only. It does not include backend communication, AI, speech processing, language models, ISL generation, or external API calls.

## Commands

Run from the repository root:

```text
npm install
npm run typecheck
npm run build
```

The unpacked extension is produced in `apps/chrome-extension/dist`.

## Current communication flow

1. The popup requests access to the active HTTP or HTTPS tab.
2. Chrome injects the packaged content script using `activeTab` and `scripting` permissions.
3. The popup sends a versioned, correlated message to the content script.
4. The content script validates the message and responds with local mock state.

The background service worker handles extension lifecycle events and content-script readiness notifications. It stores no durable in-memory state.
