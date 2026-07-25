import { getBackendConfig } from '../config/backendConfig';
import { BackendClient } from './BackendClient';
import {
  createBackendHealthMessageHandler,
  createInterpretationMessageHandler,
} from './interpretationMessageHandler';
import { StreamingBridge } from './StreamingBridge';
import { STREAM_PORT_NAME } from '../shared/streaming';
import {
  AUDIO_CAPTURE_STORAGE_KEY,
  isAudioCaptureMessage,
  type AudioCaptureMessage,
} from '../shared/audioCapture';
import { runtimeDiagnostic } from '../shared/runtimeDiagnostics';
import { ensureAudioOffscreenDocument } from './offscreenDocument';

const backendConfig = getBackendConfig();
const backendClient = new BackendClient(backendConfig);

runtimeDiagnostic('background_service_worker_started', {
  backendUrl: backendConfig.baseUrl || 'not configured',
  timeoutMs: backendConfig.timeoutMs,
  extensionId: chrome.runtime.id,
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.info('SignVerse AI extension foundation installed.');
  }
});

chrome.runtime.onMessage.addListener(createInterpretationMessageHandler(backendClient));
chrome.runtime.onMessage.addListener(createBackendHealthMessageHandler(backendClient));

const activeStreamPorts = new Map<string, number>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== STREAM_PORT_NAME) return;
  const key = `${port.sender?.tab?.id ?? 'unknown'}:${port.sender?.frameId ?? 0}`;
  const nextCount = (activeStreamPorts.get(key) ?? 0) + 1;
  activeStreamPorts.set(key, nextCount);
  if (nextCount > 1) {
    runtimeDiagnostic('duplicate_stream_port_detected', {
      tabId: port.sender?.tab?.id ?? null,
      frameId: port.sender?.frameId ?? null,
      activePorts: nextCount,
      extensionId: chrome.runtime.id,
    }, 'warn');
  }
  port.onDisconnect.addListener(() => {
    // Chrome may attach a lastError when a page enters BFCache or an unpacked
    // extension is reloaded. Reading it here prevents an unchecked runtime
    // error from being recorded for this bookkeeping-only listener.
    void chrome.runtime.lastError?.message;
    const remaining = Math.max(0, (activeStreamPorts.get(key) ?? 1) - 1);
    if (remaining === 0) activeStreamPorts.delete(key);
    else activeStreamPorts.set(key, remaining);
  });
  new StreamingBridge(backendConfig, port).start();
});

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'SIGNVERSE_CONTENT_READY'
  ) {
    runtimeDiagnostic('content_script_ready', {
      tabId: sender.tab?.id,
      frameId: sender.frameId ?? null,
      extensionId: chrome.runtime.id,
    });
  }
});

async function startAudioCapture(tabId: number, streamId: string): Promise<void> {
  await ensureAudioOffscreenDocument();
  await chrome.storage.local.set({ [AUDIO_CAPTURE_STORAGE_KEY]: tabId });
  await chrome.runtime.sendMessage({
    type: 'SIGNVERSE_AUDIO_CAPTURE_START',
    target: 'offscreen',
    streamId,
    tabId,
  } satisfies AudioCaptureMessage);
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse: (
    response: { ok: boolean; error?: string; tabId?: number },
  ) => void) => {
    if (!isAudioCaptureMessage(message) || message.target !== 'background') return false;

    if (message.type === 'SIGNVERSE_AUDIO_CAPTURE_START') {
      void startAudioCapture(message.tabId, message.streamId)
        .then(() => sendResponse({ ok: true, tabId: message.tabId }))
        .catch((error: unknown) => {
          console.error('[SignVerse] audio_capture_start_failed', error);
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'Audio capture could not start.',
          });
        });
      return true;
    }

    if (message.type === 'SIGNVERSE_AUDIO_FALLBACK_START') {
      const tabId = message.tabId ?? sender.tab?.id;
      if (tabId === undefined) {
        sendResponse({ ok: false, error: 'Automatic audio capture requires a browser tab.' });
        return false;
      }
      void chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })
        .then((streamId) => startAudioCapture(tabId, streamId))
        .then(() => sendResponse({ ok: true, tabId }))
        .catch((error: unknown) => {
          console.error('[SignVerse] audio_fallback_start_failed', error);
          const detail = error instanceof Error
            ? error.message
            : 'Automatic audio capture could not start.';
          sendResponse({
            ok: false,
            error: /not been invoked|activeTab|user gesture/iu.test(detail)
              ? 'Open the SignVerse toolbar popup on this YouTube tab and select “Listen without YouTube captions”.'
              : detail,
          });
        });
      return true;
    }

    if (message.type === 'SIGNVERSE_AUDIO_FALLBACK_STOP') {
      const tabId = message.tabId ?? sender.tab?.id;
      if (tabId === undefined) {
        sendResponse({ ok: false, error: 'Automatic audio capture requires a browser tab.' });
        return false;
      }
      void chrome.storage.local.remove(AUDIO_CAPTURE_STORAGE_KEY);
      void chrome.runtime.sendMessage({
        type: 'SIGNVERSE_AUDIO_CAPTURE_STOP',
        target: 'offscreen',
        tabId,
      } satisfies AudioCaptureMessage);
      sendResponse({ ok: true, tabId });
      return false;
    }

    if (message.type === 'SIGNVERSE_AUDIO_CAPTURE_STOP') {
      void chrome.storage.local.remove(AUDIO_CAPTURE_STORAGE_KEY);
      void chrome.runtime.sendMessage({ ...message, target: 'offscreen' } satisfies AudioCaptureMessage);
      sendResponse({ ok: true });
      return false;
    }

    if (
      message.type === 'SIGNVERSE_AUDIO_CAPTURE_STATUS' ||
      message.type === 'SIGNVERSE_AUDIO_TRANSCRIPT'
    ) {
      if (message.type === 'SIGNVERSE_AUDIO_CAPTURE_STATUS' && ['error', 'stopped'].includes(message.status)) {
        void chrome.storage.local.remove(AUDIO_CAPTURE_STORAGE_KEY);
      }
      void chrome.tabs.sendMessage(
        message.tabId,
        { ...message, target: 'content' } satisfies AudioCaptureMessage,
      ).catch((error: unknown) => {
        console.warn('[SignVerse] audio_message_delivery_failed', error);
      });
      return false;
    }

    return false;
  },
);
