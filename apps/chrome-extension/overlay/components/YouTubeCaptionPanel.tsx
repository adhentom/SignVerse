import type { YouTubeLiveSnapshot } from '../../shared/youtube';

interface YouTubeCaptionPanelProps {
  snapshot: YouTubeLiveSnapshot | null;
}

function StateMessage({ snapshot }: { snapshot: YouTubeLiveSnapshot }) {
  const isAttentionState = [
    'not-watch-page',
    'no-captions',
    'captions-disabled',
    'advertisement',
  ].includes(snapshot.status);

  return (
    <div
      aria-live="polite"
      className={`sv-youtube-message ${isAttentionState ? 'sv-youtube-message--attention' : ''}`}
    >
      <span className="sv-youtube-state-dot" />
      <span>{snapshot.statusMessage}</span>
    </div>
  );
}

export function YouTubeCaptionPanel({ snapshot }: YouTubeCaptionPanelProps) {
  if (!snapshot) {
    return (
      <div aria-busy="true" aria-live="polite" className="sv-content-state">
        <span className="sv-spinner" />
        <div>
          <strong>Connecting to YouTube</strong>
          <span>Looking for the official caption track…</span>
        </div>
      </div>
    );
  }

  const caption = snapshot.currentPacket?.text;

  return (
    <section aria-label="YouTube live caption extraction" className="sv-youtube-panel">
      <div className="sv-youtube-mode-row">
        <span>Current Mode</span>
        <strong>YouTube Interpretation</strong>
      </div>

      <div className="sv-youtube-video">
        <span className="sv-page-origin">{snapshot.metadata.channel}</span>
        <h3>{snapshot.title}</h3>
        <div className="sv-youtube-meta">
          <span>{snapshot.timestamp}</span>
          {snapshot.metadata.isLive && <span className="sv-live-badge">Live</span>}
          {snapshot.status === 'paused' && <span className="sv-paused-badge">Paused</span>}
        </div>
      </div>

      <StateMessage snapshot={snapshot} />

      <div className="sv-current-caption">
        <span>Current caption</span>
        <p>{caption || 'Waiting for an official YouTube caption.'}</p>
      </div>

      <div className="sv-caption-history">
        <div className="sv-caption-history-heading">
          <span>Caption history</span>
          <span>{snapshot.history.length}/10</span>
        </div>
        {snapshot.history.length === 0 ? (
          <p className="sv-caption-empty">Recent captions will appear here.</p>
        ) : (
          <ol>
            {snapshot.history.map((packet, index) => (
              <li key={`${packet.metadata.videoId}-${packet.timestamp}-${packet.text}-${index}`}>
                <time>{packet.timestamp}</time>
                <span>{packet.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
