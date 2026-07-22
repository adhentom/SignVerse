import { useEffect, useRef, useState } from 'react';
import type { BackendHealthState } from '../shared/backendHealth';
import type { InterpretationState } from '../shared/interpretation';
import type { LiveContentSnapshot } from '../shared/liveContent';
import type { PlatformInfo } from '../shared/platform';
import type { WebsiteContentState } from '../shared/websiteContent';
import { InterpretationPanel } from './components/InterpretationPanel';
import { SignPlaybackPanel } from './components/SignPlaybackPanel';
import { SignVerseMark } from './components/SignVerseMark';
import { UIIcon } from './components/UIIcon';
import { AvatarPreferenceControl } from './components/AvatarPreferenceControl';
import { useAvatarPreference } from './hooks/useAvatarPreference';

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

export function FloatingWidget({
  backendHealthState,
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const shouldMoveFocus = useRef(false);
  const connection = connectionCopy(backendHealthState, interpretationState);
  const avatarPreference = useAvatarPreference();

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
