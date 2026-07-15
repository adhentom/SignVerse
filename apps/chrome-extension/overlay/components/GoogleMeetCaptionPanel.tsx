import type { GoogleMeetLiveSnapshot } from '../../shared/googleMeet';

interface GoogleMeetCaptionPanelProps {
  snapshot: GoogleMeetLiveSnapshot | null;
}

export function GoogleMeetCaptionPanel({ snapshot }: GoogleMeetCaptionPanelProps) {
  if (!snapshot) {
    return (
      <div aria-busy="true" aria-live="polite" className="sv-content-state">
        <span className="sv-spinner" />
        <div>
          <strong>Connecting to Google Meet</strong>
          <span>Looking for the live caption stream…</span>
        </div>
      </div>
    );
  }

  const caption = snapshot.currentPacket;
  const attention = ['captions-disabled', 'interrupted', 'reconnecting', 'not-in-session'].includes(
    snapshot.status,
  );

  return (
    <section aria-label="Google Meet live caption extraction" className="sv-youtube-panel">
      <div className="sv-youtube-mode-row">
        <span>Current Mode</span>
        <strong>Google Meet Live</strong>
      </div>

      <div className="sv-youtube-video">
        <span className="sv-page-origin">{caption?.speaker || 'Waiting for speaker'}</span>
        <h3>{snapshot.title}</h3>
        <div className="sv-youtube-meta">
          <span>{snapshot.timestamp}</span>
          {snapshot.status === 'connected' && <span className="sv-live-badge">Live</span>}
          {snapshot.status === 'reconnecting' && <span className="sv-paused-badge">Reconnecting</span>}
        </div>
      </div>

      <div
        aria-live="polite"
        className={`sv-youtube-message ${attention ? 'sv-youtube-message--attention' : ''}`}
      >
        <span className="sv-youtube-state-dot" />
        <span>{snapshot.statusMessage}</span>
      </div>

      <div className="sv-current-caption">
        <span>Current caption</span>
        <p>{caption?.text || 'Waiting for a Google Meet caption.'}</p>
      </div>

      <div className="sv-caption-history">
        <div className="sv-caption-history-heading">
          <span>Caption history</span>
          <span>{snapshot.history.length}/10</span>
        </div>
        {snapshot.history.length === 0 ? (
          <p className="sv-caption-empty">Recent speakers and captions will appear here.</p>
        ) : (
          <ol>
            {snapshot.history.map((packet, index) => (
              <li key={`${packet.metadata.meetingId}-${packet.timestamp}-${packet.text}-${index}`}>
                <time>{packet.timestamp}</time>
                <span>
                  <strong className="sv-caption-speaker">{packet.speaker}</strong>
                  {packet.text}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
