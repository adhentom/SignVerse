import { useEffect, useRef, useState } from 'react';
import type { BackendHealthState } from '../shared/backendHealth';
import type { InterpretationState } from '../shared/interpretation';
import type { LiveContentSnapshot } from '../shared/liveContent';
import type { PlatformInfo } from '../shared/platform';
import type { WebsiteContentState } from '../shared/websiteContent';
import { InterpretationPanel } from './components/InterpretationPanel';
import {
  SignPlaybackPanel,
  type InterpreterActivity,
} from './components/SignPlaybackPanel';
import { SignVerseMark } from './components/SignVerseMark';
import { UIIcon } from './components/UIIcon';
import { AvatarPreferenceControl } from './components/AvatarPreferenceControl';
import { useAvatarPreference } from './hooks/useAvatarPreference';
import { mediaClockFromSnapshot } from '../synchronization/mediaClock';

interface FloatingWidgetProps {
  backendHealthState: BackendHealthState;
  contentState: WebsiteContentState;
  debugEnabled?: boolean;
  interpretationState: InterpretationState;
  liveState: LiveContentSnapshot | null;
  onRetry: () => void;
  onDebugChange?: (enabled: boolean) => void;
  platform: PlatformInfo;
  sourceText: string;
}

function connectionCopy(
  healthState: BackendHealthState,
  interpretationState: InterpretationState,
): { label: string; tone: string } {
  if (healthState.status === 'connected') {
    return interpretationState.status === 'loading'
      ? { label: 'Processing', tone: 'processing' }
      : { label: 'Connected', tone: 'online' };
  }
  if (healthState.status === 'checking') return { label: 'Checking', tone: 'processing' };
  if (healthState.status === 'error') {
    return {
      label: healthState.code === 'extension-context-invalidated'
        ? 'Refresh required'
        : healthState.code === 'connection-failure'
          ? 'Offline'
          : 'Unavailable',
      tone: 'offline',
    };
  }
  return { label: 'Unavailable', tone: 'offline' };
}

interface StatusIndicator {
  active: boolean;
  error?: boolean;
  label: 'Connected' | 'Listening' | 'Captions' | 'Translating' | 'Playing' | 'Error';
}

function productionStatuses({
  backendHealthState,
  interpretationState,
  liveState,
  playbackActivity,
  platformId,
  sourceText,
}: {
  backendHealthState: BackendHealthState;
  interpretationState: InterpretationState;
  liveState: LiveContentSnapshot | null;
  playbackActivity: InterpreterActivity;
  platformId: string;
  sourceText: string;
}): StatusIndicator[] {
  const livePlatform = platformId === 'youtube' || platformId === 'google-meet';
  const listening = livePlatform && ['loading', 'playing', 'connected'].includes(liveState?.status ?? '');
  const captions = livePlatform && sourceText.trim().length > 0;
  const translating = interpretationState.status === 'loading';
  const playing = playbackActivity === 'Playing';
  const sourceError = ['no-captions', 'interrupted'].includes(liveState?.status ?? '') &&
    sourceText.trim().length === 0;
  const error = backendHealthState.status === 'error' ||
    interpretationState.status === 'error' ||
    sourceError;
  return [
    { label: 'Connected', active: backendHealthState.status === 'connected' },
    { label: 'Listening', active: listening },
    { label: 'Captions', active: captions },
    { label: 'Translating', active: translating },
    { label: 'Playing', active: playing },
    { label: 'Error', active: error, error: true },
  ];
}

function sourceIssue(
  liveState: LiveContentSnapshot | null,
  sourceText: string,
): { title: string; detail: string } | null {
  if (!liveState || sourceText.trim()) return null;
  const message = liveState.statusMessage;
  if (/permission|denied|not been invoked/iu.test(message)) {
    return {
      title: 'Permission required',
      detail: `${message} Open the SignVerse popup and allow access before trying again.`,
    };
  }
  if (liveState.status === 'no-captions') {
    return {
      title: 'Transcript unavailable',
      detail: `${message} SignVerse will use tab-audio transcription when permission and a transcription provider are available.`,
    };
  }
  if (liveState.status === 'captions-disabled') {
    return {
      title: 'Captions unavailable',
      detail: message,
    };
  }
  if (liveState.status === 'interrupted') {
    return {
      title: 'Listening interrupted',
      detail: message,
    };
  }
  return null;
}

export function FloatingWidget({
  backendHealthState,
  contentState,
  debugEnabled = false,
  interpretationState,
  liveState,
  onRetry,
  onDebugChange,
  platform,
  sourceText,
}: FloatingWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [interpreterRoot, setInterpreterRoot] = useState<HTMLDivElement | null>(null);
  const [playbackActivity, setPlaybackActivity] = useState<InterpreterActivity>('Waiting');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const shouldMoveFocus = useRef(false);
  const connection = connectionCopy(backendHealthState, interpretationState);
  const avatarPreference = useAvatarPreference();
  const statuses = productionStatuses({
    backendHealthState,
    interpretationState,
    liveState,
    playbackActivity,
    platformId: platform.id,
    sourceText,
  });
  const liveIssue = sourceIssue(liveState, sourceText);
  const mediaClock = mediaClockFromSnapshot(liveState);

  useEffect(() => {
    if (!shouldMoveFocus.current) return;
    const frame = window.requestAnimationFrame(() => {
      (isExpanded ? closeButtonRef.current : fabRef.current)?.focus();
      shouldMoveFocus.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isExpanded]);

  function setExpanded(next: boolean) {
    shouldMoveFocus.current = true;
    setIsExpanded(next);
  }

  return (
    <div className={`sv-widget ${isExpanded ? 'sv-widget--expanded' : 'sv-widget--collapsed'}`}>
      <aside
          aria-label="SignVerse AI accessibility sidebar"
          className="sv-sidebar"
          hidden={!isExpanded}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setExpanded(false);
          }}
        >
          <header className="sv-sidebar-header">
            <div className="sv-brand-lockup">
              <SignVerseMark />
              <div>
                <span className="sv-product-name">SignVerse</span>
                <span className="sv-product-tagline">AI accessibility interpreter</span>
              </div>
            </div>
            <button
              aria-label="Minimize SignVerse sidebar"
              className="sv-close-button"
              onClick={() => setExpanded(false)}
              ref={closeButtonRef}
              title="Minimize sidebar; interpreter stays visible"
              type="button"
            >
              <UIIcon name="minimize" />
            </button>
          </header>

          <div className="sv-sidebar-scroll">
            <section aria-label="Current SignVerse status" aria-live="polite" className="sv-command-bar">
              <div className={`sv-connection sv-connection--${connection.tone}`}>
                <span className="sv-connection-dot" />
                <div>
                  <span>Connection</span>
                  <strong>{connection.label}</strong>
                </div>
                {backendHealthState.status === 'error' &&
                  backendHealthState.code === 'extension-context-invalidated' && (
                    <button
                      aria-label="Refresh page to reconnect SignVerse"
                      className="sv-connection-action"
                      onClick={onRetry}
                      type="button"
                    >
                      Refresh
                    </button>
                  )}
              </div>
              <div className="sv-platform-status">
                <span className="sv-platform-icon"><UIIcon name="globe" /></span>
                <div>
                  <span>Current platform</span>
                  <strong>{platform.displayName}</strong>
                </div>
              </div>
            </section>

            <ul aria-label="Interpreter processing status" className="sv-status-indicators">
              {statuses.map((status) => (
                <li
                  aria-current={status.active ? 'step' : undefined}
                  className={[
                    'sv-status-indicator',
                    status.active ? 'sv-status-indicator--active' : '',
                    status.error && status.active ? 'sv-status-indicator--error' : '',
                  ].filter(Boolean).join(' ')}
                  key={status.label}
                >
                  <span aria-hidden="true" />
                  {status.label}
                </li>
              ))}
            </ul>

            {backendHealthState.status === 'error' && interpretationState.status !== 'error' && (
              <section aria-live="assertive" className="sv-service-notice" role="alert">
                <span className="sv-error-visual"><UIIcon name="alert" /></span>
                <div>
                  <strong>Backend offline</strong>
                  <p>{backendHealthState.message}</p>
                  <button className="sv-retry-button" onClick={onRetry} type="button">
                    <UIIcon name="refresh" />
                    Retry connection
                  </button>
                </div>
              </section>
            )}

            {liveIssue && (
              <section
                aria-live={liveIssue.title === 'Permission required' ? 'assertive' : 'polite'}
                className="sv-source-notice"
                role={liveIssue.title === 'Permission required' ? 'alert' : 'status'}
              >
                <span className="sv-state-icon"><UIIcon name="alert" /></span>
                <div>
                  <strong>{liveIssue.title}</strong>
                  <p>{liveIssue.detail}</p>
                </div>
              </section>
            )}

            {platform.id === 'website' && contentState.status === 'error' && (
              <section aria-live="polite" className="sv-source-notice" role="status">
                <span className="sv-state-icon"><UIIcon name="alert" /></span>
                <div>
                  <strong>Page content unavailable</strong>
                  <p>{contentState.message}</p>
                </div>
              </section>
            )}

            <section aria-labelledby="sv-results-heading" className="sv-results-section">
              <div className="sv-section-title">
                <div>
                  <span className="sv-overline">Interpretation</span>
                  <h2 id="sv-results-heading">Accessible output</h2>
                </div>
                <span>{platform.modeLabel}</span>
              </div>
              <AvatarPreferenceControl
                onChange={avatarPreference.select}
                selected={avatarPreference.profile.id}
              />
              <InterpretationPanel
                debugEnabled={debugEnabled}
                onDebugChange={onDebugChange}
                onRetry={onRetry}
                state={interpretationState}
              />
            </section>
          </div>
        </aside>
      {!isExpanded && (
        <button
          aria-label="Open SignVerse accessibility sidebar"
          className="sv-fab"
          onClick={() => setExpanded(true)}
          ref={fabRef}
          type="button"
        >
          <SignVerseMark compact />
          <span className={`sv-fab-status sv-fab-status--${connection.tone}`} />
        </button>
      )}
      <div className="sv-floating-interpreter-root" ref={setInterpreterRoot} />
      <div className="sv-playback-host">
        <SignPlaybackPanel
          paused={liveState?.status === 'paused' || liveState?.status === 'advertisement' || liveState?.status === 'reconnecting'}
          debugEnabled={debugEnabled}
          mediaClock={mediaClock}
          onActivityChange={setPlaybackActivity}
          profile={avatarPreference.profile}
          portalTarget={interpreterRoot}
          sourceStatus={liveState?.statusMessage ?? ''}
          sourceText={sourceText}
          state={interpretationState}
        />
      </div>
    </div>
  );
}
