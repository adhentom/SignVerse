import { useEffect, useRef, useState } from 'react';
import type { BackendHealthState } from '../shared/backendHealth';
import type { GoogleMeetLiveSnapshot } from '../shared/googleMeet';
import type { InterpretationState } from '../shared/interpretation';
import type { LiveContentSnapshot } from '../shared/liveContent';
import type { PlatformInfo } from '../shared/platform';
import type { WebsiteContentState } from '../shared/websiteContent';
import type { YouTubeLiveSnapshot } from '../shared/youtube';
import { CollapsibleCard } from './components/CollapsibleCard';
import { ContentPreview } from './components/ContentPreview';
import { GoogleMeetCaptionPanel } from './components/GoogleMeetCaptionPanel';
import { InterpretationPanel } from './components/InterpretationPanel';
import { PipelineProgress } from './components/PipelineProgress';
import { SignPlaybackPanel } from './components/SignPlaybackPanel';
import { SignVerseMark } from './components/SignVerseMark';
import { UIIcon } from './components/UIIcon';
import { YouTubeCaptionPanel } from './components/YouTubeCaptionPanel';

interface FloatingWidgetProps {
  backendHealthState: BackendHealthState;
  contentState: WebsiteContentState;
  interpretationState: InterpretationState;
  liveState: LiveContentSnapshot | null;
  onRetry: () => void;
  platform: PlatformInfo;
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

function SourcePanel({
  contentState,
  liveState,
  platform,
}: Pick<FloatingWidgetProps, 'contentState' | 'liveState' | 'platform'>) {
  if (platform.id === 'youtube') {
    return <YouTubeCaptionPanel snapshot={liveState as YouTubeLiveSnapshot | null} />;
  }
  if (platform.id === 'google-meet') {
    return <GoogleMeetCaptionPanel snapshot={liveState as GoogleMeetLiveSnapshot | null} />;
  }
  return <ContentPreview contentState={contentState} />;
}

export function FloatingWidget({
  backendHealthState,
  contentState,
  interpretationState,
  liveState,
  onRetry,
  platform,
}: FloatingWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const shouldMoveFocus = useRef(false);
  const connection = connectionCopy(backendHealthState, interpretationState);

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
      {isExpanded ? (
        <aside
          aria-label="SignVerse AI accessibility sidebar"
          className="sv-sidebar"
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
            <span aria-hidden="true" className="sv-accessibility-mark">
              <UIIcon name="accessibility" />
            </span>
            <button
              aria-label="Close SignVerse sidebar"
              className="sv-close-button"
              onClick={() => setExpanded(false)}
              ref={closeButtonRef}
              type="button"
            >
              <span aria-hidden="true">×</span>
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

            <PipelineProgress state={interpretationState} />

            <section aria-labelledby="sv-results-heading" className="sv-results-section">
              <div className="sv-section-title">
                <div>
                  <span className="sv-overline">Interpretation</span>
                  <h2 id="sv-results-heading">Accessible output</h2>
                </div>
                <span>{platform.modeLabel}</span>
              </div>
              <InterpretationPanel onRetry={onRetry} state={interpretationState} />
              <SignPlaybackPanel state={interpretationState} />
            </section>

            <CollapsibleCard icon="globe" title="Source content">
              <SourcePanel contentState={contentState} liveState={liveState} platform={platform} />
            </CollapsibleCard>

            <footer className="sv-sidebar-footer">
              <UIIcon name="status" />
              <span>{platform.statusLabel}</span>
              <small>Results stay ephemeral and are not stored by the extension.</small>
            </footer>
          </div>
        </aside>
      ) : (
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
    </div>
  );
}
