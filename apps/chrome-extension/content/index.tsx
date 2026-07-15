import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingWidget } from '../overlay/FloatingWidget';
import widgetStyles from '../overlay/widget.css?inline';
import type {
  ContentStatus,
  ExtensionMessage,
  ExtensionResponse,
} from '../shared/messages';
import type { WebsiteContentState } from '../shared/websiteContent';
import type { LiveContentSnapshot } from '../shared/liveContent';
import type { ContentPacket } from '../shared/contentPacket';
import { adapterFactory } from './adapters/AdapterFactory';
import { supportsLiveContent } from './adapters/PlatformAdapter';
import { useInterpretation } from './interpretation/useInterpretation';
import { websiteContentToPacket } from './interpretation/websiteContentPacket';

declare global {
  interface Window {
    __SIGNVERSE_CONTENT_INITIALIZED__?: boolean;
  }
}

const MOCK_TEXT = 'Mock interpretation ready — no AI or external services are connected.';
let mockEnabled = false;
const platformAdapter = adapterFactory.create(window.location.href);

function WidgetContainer() {
  const [contentState, setContentState] = useState<WebsiteContentState>({ status: 'loading' });
  const [liveState, setLiveState] = useState<LiveContentSnapshot | null>(null);
  const [websitePacket, setWebsitePacket] = useState<ContentPacket | null>(null);

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      try {
        const content = platformAdapter.extractContent();
        if (!cancelled) {
          setContentState({ status: 'ready', content });
          if (platformAdapter.platform.id === 'website') {
            setWebsitePacket(websiteContentToPacket(content));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setContentState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Visible page content could not be read.',
          });
          setWebsitePacket(null);
        }
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const activePacket = platformAdapter.platform.id === 'website'
    ? websitePacket
    : liveState?.currentPacket ?? null;
  const { retry, state: interpretationState } = useInterpretation(
    activePacket,
    platformAdapter.platform.id === 'website' ? 0 : 350,
  );

  useEffect(() => {
    if (!supportsLiveContent(platformAdapter)) {
      setLiveState(null);
      return;
    }

    const session = platformAdapter.createLiveSession();
    return session.start((snapshot) => {
      setLiveState(snapshot);
    });
  }, []);

  return (
    <FloatingWidget
      contentState={contentState}
      platform={platformAdapter.platform}
      liveState={liveState}
      interpretationState={interpretationState}
      onRetry={retry}
    />
  );
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
