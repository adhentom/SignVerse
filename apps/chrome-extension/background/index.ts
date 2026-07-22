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

const backendConfig = getBackendConfig();
const backendClient = new BackendClient(backendConfig);

console.info('[SignVerse] background_service_worker_started', {
  backendUrl: backendConfig.baseUrl || 'not configured',
  timeoutMs: backendConfig.timeoutMs,
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.info('SignVerse AI extension foundation installed.');
  }
});

chrome.runtime.onMessage.addListener(createInterpretationMessageHandler(backendClient));
chrome.runtime.onMessage.addListener(createBackendHealthMessageHandler(backendClient));

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === STREAM_PORT_NAME) new StreamingBridge(backendConfig, port).start();
});

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'SIGNVERSE_CONTENT_READY'
  ) {
    console.info('SignVerse AI content script ready.', {
      tabId: sender.tab?.id,
    });
  }
});

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Capture user-authorized tab audio for accessible live transcription.',
  });
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (response: { ok: boolean; error?: string }) => void) => {
    if (!isAudioCaptureMessage(message) || message.target !== 'background') return false;

    if (message.type === 'SIGNVERSE_AUDIO_CAPTURE_START') {
      void ensureOffscreenDocument()
        .then(async () => {
          await chrome.storage.local.set({ [AUDIO_CAPTURE_STORAGE_KEY]: message.tabId });
          await chrome.runtime.sendMessage({ ...message, target: 'offscreen' } satisfies AudioCaptureMessage);
          sendResponse({ ok: true });
        })
        .catch((error: unknown) => {
          console.error('[SignVerse] audio_capture_start_failed', error);
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'Audio capture could not start.',
          });
        });
      return true;
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
