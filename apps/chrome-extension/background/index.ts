import { getBackendConfig } from '../config/backendConfig';
import { BackendClient } from './BackendClient';
import {
  createBackendHealthMessageHandler,
  createInterpretationMessageHandler,
} from './interpretationMessageHandler';
import { StreamingBridge } from './StreamingBridge';
import { STREAM_PORT_NAME } from '../shared/streaming';

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
