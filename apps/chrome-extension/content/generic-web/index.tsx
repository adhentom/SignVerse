import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingWidget } from '../../overlay/FloatingWidget';
import widgetStyles from '../../overlay/widget.css?inline';
import type {
  ContentStatus,
  ExtensionMessage,
  ExtensionResponse,
} from '../../shared/messages';
import type { WebsiteContentState } from '../../shared/websiteContent';
import { extractWebsiteContent } from './extraction/extractWebsiteContent';

declare global {
  interface Window {
    __SIGNVERSE_CONTENT_INITIALIZED__?: boolean;
  }
}

const MOCK_TEXT = 'Mock interpretation ready — no AI or external services are connected.';
let mockEnabled = false;

function WidgetContainer() {
  const [contentState, setContentState] = useState<WebsiteContentState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      try {
        const content = extractWebsiteContent();
        if (!cancelled) {
          setContentState({ status: 'ready', content });
        }
      } catch (error) {
        if (!cancelled) {
          setContentState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Visible page content could not be read.',
          });
        }
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <FloatingWidget contentState={contentState} />;
}

function mountWidget(): void {
  const existingHost = document.getElementById('signverse-ai-widget-host');
  if (existingHost) {
    return;
  }

  const host = document.createElement('div');
  host.id = 'signverse-ai-widget-host';
  host.setAttribute('data-signverse-root', '');

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = widgetStyles;

  const mountPoint = document.createElement('div');
  mountPoint.id = 'signverse-ai-widget';

  shadowRoot.append(style, mountPoint);
  document.documentElement.append(host);

  createRoot(mountPoint).render(
    <StrictMode>
      <WidgetContainer />
    </StrictMode>,
  );
}

function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ExtensionMessage>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.correlationId === 'string' &&
    (candidate.type === 'SIGNVERSE_GET_STATUS' ||
      candidate.type === 'SIGNVERSE_TOGGLE_MOCK')
  );
}

function getStatus(): ContentStatus {
  return {
    enabled: mockEnabled,
    pageTitle: document.title || 'Untitled page',
    mockText: MOCK_TEXT,
  };
}

if (!window.__SIGNVERSE_CONTENT_INITIALIZED__) {
  window.__SIGNVERSE_CONTENT_INITIALIZED__ = true;
  mountWidget();

  chrome.runtime.onMessage.addListener(
    (message: unknown, _sender, sendResponse: (response: ExtensionResponse) => void) => {
      if (!isExtensionMessage(message)) {
        return false;
      }

      if (message.type === 'SIGNVERSE_TOGGLE_MOCK') {
        mockEnabled = !mockEnabled;
      }

      sendResponse({
        ok: true,
        correlationId: message.correlationId,
        data: getStatus(),
      });

      return false;
    },
  );

  void chrome.runtime.sendMessage({ type: 'SIGNVERSE_CONTENT_READY' });
}
