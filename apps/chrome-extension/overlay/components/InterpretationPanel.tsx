import type { InterpretationResponse, InterpretationState } from '../../shared/interpretation';

interface InterpretationPanelProps {
  state: InterpretationState;
}

interface ResultListProps {
  emptyLabel: string;
  items: string[];
  label: string;
}

function ResultList({ emptyLabel, items, label }: ResultListProps) {
  return (
    <div className="sv-interpretation-field">
      <h4>{label}</h4>
      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <p className="sv-interpretation-empty">{emptyLabel}</p>
      )}
    </div>
  );
}

function InterpretationResult({ response }: { response: InterpretationResponse }) {
  return (
    <section aria-label="Backend interpretation result" className="sv-interpretation-result">
      <div className="sv-interpretation-summary">
        <div>
          <span>Summary</span>
          <p>{response.summary || 'No summary returned by the mock service.'}</p>
        </div>
        <span className="sv-confidence" title="Interpretation confidence">
          {Math.round(response.confidence * 100)}%
        </span>
      </div>

      <ResultList emptyLabel="No key points returned." items={response.key_points} label="Key points" />
      <ResultList emptyLabel="No keywords returned." items={response.keywords} label="Keywords" />
      <ResultList emptyLabel="No glossary entries returned." items={response.glossary} label="Glossary" />
      <ResultList emptyLabel="No ISL gloss returned." items={response.isl_gloss} label="ISL Gloss" />
    </section>
  );
}

export function InterpretationPanel({ state }: InterpretationPanelProps) {
  if (state.status === 'idle') {
    return (
      <div aria-live="polite" className="sv-content-state">
        <span className="sv-idle-icon">···</span>
        <div>
          <strong>Waiting for interpretable content</strong>
          <span>A result will appear when page text or a live caption is available.</span>
        </div>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" aria-live="polite" className="sv-content-state">
        <span className="sv-spinner" />
        <div>
          <strong>Requesting interpretation</strong>
          <span>Waiting for the configured SignVerse backend…</span>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div aria-live="assertive" className="sv-content-state sv-content-state--error" role="alert">
        <span className="sv-error-icon">!</span>
        <div>
          <strong>Interpretation unavailable</strong>
          <span>{state.message}</span>
        </div>
      </div>
    );
  }

  return <InterpretationResult response={state.response} />;
}
