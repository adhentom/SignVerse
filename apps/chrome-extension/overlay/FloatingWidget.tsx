import { useState } from 'react';
import type { PlatformInfo } from '../shared/platform';
import type { WebsiteContentState } from '../shared/websiteContent';
import { ContentPreview } from './components/ContentPreview';
import { ModeCard } from './components/ModeCard';
import { SignVerseMark } from './components/SignVerseMark';
import { useDraggable } from './hooks/useDraggable';
import type { ModePlaceholder } from './types';

const MODES: ModePlaceholder[] = [
  {
    platformId: 'website',
    label: 'Website Mode',
    description: 'Interpret page content',
    icon: 'website',
  },
  {
    platformId: 'youtube',
    label: 'YouTube Mode',
    description: 'Follow video captions',
    icon: 'youtube',
  },
  {
    platformId: 'google-meet',
    label: 'Google Meet Mode',
    description: 'Support live conversations',
    icon: 'meet',
  },
];

interface FloatingWidgetProps {
  contentState: WebsiteContentState;
  platform: PlatformInfo;
}

export function FloatingWidget({ contentState, platform }: FloatingWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { widgetRef, position, isDragging, dragHandleProps } = useDraggable();

  return (
    <div
      className={`sv-widget ${isExpanded ? 'sv-widget--expanded' : 'sv-widget--collapsed'} ${isDragging ? 'sv-widget--dragging' : ''}`}
      ref={widgetRef}
      style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
    >
      <section
        aria-label="SignVerse AI accessibility interpreter"
        aria-hidden={!isExpanded}
        className="sv-panel"
      >
        <header className="sv-header" {...dragHandleProps}>
          <div className="sv-brand">
            <SignVerseMark />
            <div>
              <h2>SignVerse AI</h2>
              <p>Accessibility interpreter</p>
            </div>
          </div>
          <button
            aria-label="Minimize SignVerse AI"
            className="sv-icon-button"
            onClick={() => setIsExpanded(false)}
            type="button"
          >
            <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
              <path d="M5 10h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            </svg>
          </button>
        </header>

        <div className="sv-content">
          <div aria-live="polite" className="sv-status">
            <span className="sv-status-indicator">
              <span />
            </span>
            <div>
              <span className="sv-eyebrow">Status</span>
              <strong>{platform.statusLabel}</strong>
            </div>
            <span className="sv-platform-chip">{platform.displayName}</span>
          </div>

          <div className="sv-section-heading">
            <span>Website content</span>
            <span className="sv-placeholder-label">Visible text only</span>
          </div>

          <ContentPreview contentState={contentState} />

          <div className="sv-section-heading">
            <span>Modes</span>
            <span className="sv-placeholder-label">Placeholders</span>
          </div>

          <div className="sv-mode-list">
            {MODES.map((mode) => (
              <ModeCard
                isActive={mode.platformId === platform.id}
                key={mode.label}
                mode={mode}
              />
            ))}
          </div>

          <p className="sv-privacy-note">
            <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
              <path d="M4.5 7V5.5a3.5 3.5 0 1 1 7 0V7M3 7h10v7H3V7Z" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            Processed locally · Nothing is sent or stored
          </p>
        </div>
      </section>

      <button
        aria-label="Expand SignVerse AI"
        aria-hidden={isExpanded}
        className="sv-fab"
        onClick={() => setIsExpanded(true)}
        tabIndex={isExpanded ? -1 : 0}
        type="button"
      >
        <SignVerseMark compact />
        <span className="sv-fab-pulse" />
      </button>
    </div>
  );
}
