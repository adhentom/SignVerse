import type { InterpretationState, PlaybackSequence } from '../../shared/interpretation';

const EMPTY_SEQUENCE: PlaybackSequence = { items: [], unsupported_tokens: [] };

function PlaybackResult({ sequence }: { sequence: PlaybackSequence }) {
  return (
    <section aria-label="Sign playback plan" className="sv-playback-result">
      <div className="sv-playback-header">
        <div>
          <span>Token sequence</span>
          <strong>{sequence.items.length} scheduled</strong>
        </div>
        <span className="sv-playback-status">Plan ready</span>
      </div>

      {sequence.items.length > 0 ? (
        <ol className="sv-playback-list">
          {sequence.items.map((item, index) => (
            <li key={`${item.asset_id}-${index}`}>
              <span className="sv-playback-order">{index + 1}</span>
              <div>
                <strong>{item.token_id}</strong>
                <span>{item.asset_id} · {item.duration.toFixed(1)}s</span>
              </div>
              <span className="sv-playback-confidence">
                {Math.round(item.confidence * 100)}%
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="sv-playback-empty">No supported sign assets were scheduled.</p>
      )}

      <div className="sv-playback-unsupported">
        <span>Unsupported tokens</span>
        {sequence.unsupported_tokens.length > 0 ? (
          <ul>
            {sequence.unsupported_tokens.map((token) => <li key={token}>{token}</li>)}
          </ul>
        ) : (
          <p>None</p>
        )}
      </div>
    </section>
  );
}

export function SignPlaybackPanel({ state }: { state: InterpretationState }) {
  if (state.status === 'loading') {
    return (
      <div aria-busy="true" aria-live="polite" className="sv-content-state">
        <span className="sv-spinner" />
        <div>
          <strong>Planning sign playback</strong>
          <span>Validating governed tokens and matching placeholder assets…</span>
        </div>
      </div>
    );
  }

  if (state.status === 'ready') {
    return <PlaybackResult sequence={state.response.playback ?? EMPTY_SEQUENCE} />;
  }

  return (
    <div aria-live="polite" className="sv-content-state">
      <span className="sv-idle-icon">▶</span>
      <div>
        <strong>Playback plan unavailable</strong>
        <span>A plan appears after a successful governed interpretation.</span>
      </div>
    </div>
  );
}
