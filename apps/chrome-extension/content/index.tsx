import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingWidget } from '../overlay/FloatingWidget';
import widgetStyles from '../overlay/widget.css?inline';
import type {
  ContentStatus,
  ExtensionMessage,
  ExtensionResponse,
} from '../shared/messages';
import type { WebsiteContentState } from '../shared/websiteContent';
import { resolveLiveSourceText, type LiveContentSnapshot } from '../shared/liveContent';
import type { ContentPacket } from '../shared/contentPacket';
import { adapterFactory } from './adapters/AdapterFactory';
import { supportsLiveContent } from './adapters/PlatformAdapter';
import { useStreamingInterpretation } from './interpretation/useStreamingInterpretation';
import { useBackendHealth } from './interpretation/useBackendHealth';
import { startWebsiteExtraction } from './interpretation/startWebsiteExtraction';
import {
  isAudioCaptureMessage,
  type AudioCaptureMessage,
} from '../shared/audioCapture';
import type { YouTubeLiveSnapshot } from '../shared/youtube';
import { appendAudioTranscript, audioStatusSnapshot } from './youtube/audioTranscript';
import {
  captionTimeoutMs,
  YouTubeAudioFallback,
} from './youtube/YouTubeAudioFallback';
import {
  getIslDebugMode,
  ISL_DEBUG_STORAGE_KEY,
  setIslDebugMode,
} from '../shared/debugMode';
import {
  getSitePreferences,
  isSiteEnabled,
  preferencesFromStorageChange,
} from '../shared/sitePreferences';

declare global {
  interface Window {
    __SIGNVERSE_CONTENT_INITIALIZED__?: boolean;
  }
}

const MOCK_TEXT = 'Mock interpretation ready — no AI or external services are connected.';
let mockEnabled = false;
const platformAdapter = adapterFactory.create(window.location.href);
const developerControlsEnabled =
  import.meta.env.DEV && import.meta.env.VITE_SIGNVERSE_ENABLE_DEVELOPER_CONTROLS === 'true';

function WidgetContainer() {
  const [contentState, setContentState] = useState<WebsiteContentState>({ status: 'loading' });
  const [liveState, setLiveState] = useState<LiveContentSnapshot | null>(null);
  const [audioLiveState, setAudioLiveState] = useState<YouTubeLiveSnapshot | null>(null);
  const [websitePacket, setWebsitePacket] = useState<ContentPacket | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [siteAccess, setSiteAccess] = useState<'loading' | 'enabled' | 'disabled'>('loading');
  const liveStateRef = useRef<LiveContentSnapshot | null>(null);
  const audioFallbackRef = useRef<YouTubeAudioFallback | null>(null);
  const visible = siteAccess === 'enabled';

  if (platformAdapter.platform.id === 'youtube' && !audioFallbackRef.current) {
    audioFallbackRef.current = new YouTubeAudioFallback({
      timeoutMs: captionTimeoutMs(import.meta.env.VITE_SIGNVERSE_CAPTION_TIMEOUT_MS),
      startCapture: async () => {
        const response = await chrome.runtime.sendMessage({
          type: 'SIGNVERSE_AUDIO_FALLBACK_START',
          target: 'background',
        } satisfies AudioCaptureMessage) as { error?: string; ok: boolean };
        if (!response.ok) {
          console.warn('[SignVerse] audio_fallback_start_failed', {
            error: response.error ?? 'Automatic audio capture could not start.',
          });
        }
        return response.ok;
      },
      stopCapture: async () => {
        await chrome.runtime.sendMessage({
          type: 'SIGNVERSE_AUDIO_FALLBACK_STOP',
          target: 'background',
        } satisfies AudioCaptureMessage);
      },
    });
  }

  useEffect(() => {
    liveStateRef.current = liveState;
  }, [liveState]);

  useEffect(() => {
    let active = true;
    const updateAccess = (preferences: Awaited<ReturnType<typeof getSitePreferences>>) => {
      if (!active) return;
      const enabled = isSiteEnabled(window.location.hostname, preferences);
      setSiteAccess(enabled ? 'enabled' : 'disabled');
      console.info('[SignVerse] site_access_updated', {
        domain: window.location.hostname,
        enabled,
        onboardingComplete: preferences.onboardingComplete,
      });
    };
    void getSitePreferences()
      .then(updateAccess)
      .catch((error: unknown) => {
        console.warn('[SignVerse] site_preferences_unavailable', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (active) setSiteAccess('disabled');
      });
    const handleStorage = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local') return;
      const preferences = preferencesFromStorageChange(changes);
      if (preferences) updateAccess(preferences);
    };
    chrome.storage.onChanged.addListener(handleStorage);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(handleStorage);
    };
  }, []);

  useEffect(() => {
    const handleAudioMessage = (message: unknown) => {
      if (!isAudioCaptureMessage(message) || message.target !== 'content') return false;
      if (platformAdapter.platform.id !== 'youtube') return false;

      if (message.type === 'SIGNVERSE_AUDIO_CAPTURE_STATUS') {
        if (message.status === 'stopped') {
          setAudioLiveState(null);
          return false;
        }
        setAudioLiveState((previous) => {
          return audioStatusSnapshot(
            previous,
            liveStateRef.current as YouTubeLiveSnapshot | null,
            message,
          );
        });
        return false;
      }

      if (message.type === 'SIGNVERSE_AUDIO_TRANSCRIPT') {
        const official = liveStateRef.current as YouTubeLiveSnapshot | null;
        if (!audioFallbackRef.current?.acceptTranscription(message, official)) return false;
        setAudioLiveState((previous) => {
          const next = appendAudioTranscript(previous, official, message);
          console.info('[SignVerse] content_packet_created', {
            source: 'tab-audio',
            sequence: message.sequence,
            textLength: next.currentPacket?.text.length ?? 0,
            videoId: String(next.metadata.videoId ?? ''),
          });
          return next;
        });
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(handleAudioMessage);
    return () => chrome.runtime.onMessage.removeListener(handleAudioMessage);
  }, []);

  useEffect(() => {
    if (platformAdapter.platform.id !== 'youtube') return;
    if (!visible) {
      audioFallbackRef.current?.dispose();
      setAudioLiveState(null);
      return;
    }
    const official = liveState as YouTubeLiveSnapshot | null;
    audioFallbackRef.current?.observe(official);
    if (official?.currentPacket) setAudioLiveState(null);
  }, [liveState, visible]);

  useEffect(() => {
    if (!visible) return;
    console.info('[SignVerse] automatic_interpretation_started', {
      platform: platformAdapter.platform.id,
      mode: platformAdapter.platform.modeLabel,
    });
  }, [visible]);

  useEffect(() => {
    let active = true;
    void getIslDebugMode().then((value) => {
      if (active) setDebugEnabled(value);
    });
    const handleStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[ISL_DEBUG_STORAGE_KEY]) {
        setDebugEnabled(changes[ISL_DEBUG_STORAGE_KEY].newValue === true);
      }
    };
    chrome.storage.onChanged.addListener(handleStorage);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const handleContent = (content: ReturnType<typeof platformAdapter.extractContent>) => {
      if (!cancelled) setContentState({ status: 'ready', content });
    };
    const handleError = (error: unknown) => {
      if (!cancelled) {
        setContentState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Visible page content could not be read.',
        });
        setWebsitePacket(null);
      }
    };

    if (platformAdapter.platform.id === 'website') {
      return startWebsiteExtraction(
        platformAdapter,
        ({ content, packet }) => {
          handleContent(content);
          setWebsitePacket(packet);
          if (packet) {
            console.info('[SignVerse] website_packet_ready', {
              textLength: packet.text.length,
              title: packet.title,
            });
          }
        },
        handleError,
      );
    }

    const timer = window.setTimeout(() => {
      try {
        const content = platformAdapter.extractContent();
        handleContent(content);
      } catch (error) {
        handleError(error);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [visible]);

  const effectiveLiveState = platformAdapter.platform.id === 'youtube'
    ? liveState?.currentPacket
      ? liveState
      : audioLiveState ?? liveState
    : liveState;
  const extractedPacket = !visible
    ? null
    : platformAdapter.platform.id === 'website'
      ? websitePacket
      : effectiveLiveState?.currentPacket ?? null;
  const activePacket = extractedPacket && developerControlsEnabled && debugEnabled
    ? { ...extractedPacket, metadata: { ...extractedPacket.metadata, debug: true } }
    : extractedPacket;
  const displaySourceText = activePacket?.text ?? (
    platformAdapter.platform.id !== 'website'
      ? resolveLiveSourceText(effectiveLiveState)
      : ''
  );
  const { retry, state: interpretationState } = useStreamingInterpretation(
    activePacket,
    0,
    visible,
  );
  const { retry: retryHealth, state: backendHealthState } = useBackendHealth(visible);

  useEffect(() => {
    if (!visible || !supportsLiveContent(platformAdapter)) {
      setLiveState(null);
      return;
    }

    const session = platformAdapter.createLiveSession();
    return session.start((snapshot) => {
      setLiveState(snapshot);
    });
  }, [visible]);

  if (siteAccess !== 'enabled') return null;

  return (
    <FloatingWidget
      contentState={contentState}
      platform={platformAdapter.platform}
      liveState={effectiveLiveState}
      sourceText={displaySourceText}
      interpretationState={interpretationState}
      backendHealthState={backendHealthState}
      debugEnabled={developerControlsEnabled && debugEnabled}
      onRetry={() => {
        console.info('[SignVerse] retry_requested');
        if (
          backendHealthState.status === 'error' &&
          backendHealthState.code === 'extension-context-invalidated'
        ) {
          window.location.reload();
          return;
        }
        retryHealth();
        retry();
      }}
      onDebugChange={developerControlsEnabled
        ? (next) => {
            setDebugEnabled(next);
            void setIslDebugMode(next);
          }
        : undefined}
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

  void chrome.runtime.sendMessage({ type: 'SIGNVERSE_CONTENT_READY' }).catch(() => undefined);
}
