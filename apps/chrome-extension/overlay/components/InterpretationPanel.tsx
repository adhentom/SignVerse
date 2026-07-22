import { useEffect, useState } from 'react';
import type {
  InterpretationErrorCode,
  InterpretationResponse,
  InterpretationState,
} from '../../shared/interpretation';
import { CollapsibleCard } from './CollapsibleCard';
import { UIIcon } from './UIIcon';

interface InterpretationPanelProps {
  debugEnabled?: boolean;
  onDebugChange?: (enabled: boolean) => void;
  onRetry: () => void;
  state: InterpretationState;
}

const ERROR_DETAILS: Record<InterpretationErrorCode, { title: string; detail: string }> = {
  'extension-context-invalidated': {
    title: 'Page refresh required',
    detail: 'SignVerse was updated while this page was open. Refresh to load the current extension.',
  },
  configuration: {
    title: 'Backend not configured',
    detail: 'Add the SignVerse backend URL and rebuild the extension.',
  },
  timeout: {
    title: 'Request timed out',
    detail: 'The backend took too long to respond. Your page remains unchanged.',
  },
  'connection-failure': {
    title: 'You appear to be offline',
    detail: 'Check your network connection, then try the interpretation again.',
  },
  'backend-unavailable': {
    title: 'Backend temporarily unavailable',
    detail: 'SignVerse could not reach the interpretation service.',
  },
  'invalid-response': {
    title: 'Response could not be verified',
    detail: 'The backend returned data that did not match the trusted contract.',
  },
};

function SkeletonCards() {
  return (
    <div aria-hidden="true" className="sv-skeleton-stack">
      {[72, 56, 56, 56].map((height, index) => (
        <div className="sv-skeleton-card" key={height + index} style={{ minHeight: height }}>
          <span className="sv-skeleton-icon" />
          <span className="sv-skeleton-line" />
          <span className="sv-skeleton-short" />
        </div>
      ))}
    </div>
  );
}

function EmptyCopy({ children }: { children: string }) {
  return <p className="sv-empty-copy">{children}</p>;
}

async function writeToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard copy was rejected.');
}

function QualityValue({ label, value }: { label: string; value: number | undefined }) {
  return (
    <li>
      <span>{label}</span>
      <strong>{value === undefined ? 'Pending' : `${Math.round(value * 100)}%`}</strong>
    </li>
  );
}

function DiagnosticCard({ response }: { response: InterpretationResponse }) {
  const diagnostics = response.diagnostics;
  return (
    <CollapsibleCard defaultExpanded icon="code" title="ISL Diagnostics">
      {!diagnostics ? (
        <EmptyCopy>Waiting for a diagnostic interpretation response.</EmptyCopy>
      ) : (
        <div className="sv-diagnostics">
          <h4>Source</h4>
          <p>{diagnostics.source_text}</p>
          <h4>Phrase-level ISL plan</h4>
          <ol>
            {diagnostics.phrase_segments.map((segment) => (
              <li key={segment.segment_id}>
                <strong>{segment.meaning}</strong>
                <span>{segment.glosses.map((unit) => unit.gloss).join(' · ')}</span>
              </li>
            ))}
          </ol>
          <h4>Assets</h4>
          <p>{diagnostics.matched_assets.join(', ') || 'No validated assets matched.'}</p>
          {diagnostics.missing_glosses.length > 0 && (
            <p>Subtitle fallback: {diagnostics.missing_glosses.join(', ')}</p>
          )}
          <details>
            <summary>Semantic representation</summary>
            <pre>{JSON.stringify(diagnostics.semantic_representation, null, 2)}</pre>
          </details>
        </div>
      )}
      {response.quality && (
        <ul className="sv-quality-grid" aria-label="Interpretation quality scores">
          <QualityValue label="Semantics" value={response.quality.semantic_accuracy} />
          <QualityValue label="Malayalam" value={response.quality.malayalam_translation} />
          <QualityValue label="ISL gloss" value={response.quality.gloss_correctness} />
          <QualityValue label="Assets" value={response.quality.asset_matching} />
          <QualityValue label="Animation" value={response.quality.animation_readiness} />
          <QualityValue label="Avatar" value={response.quality.avatar_confidence} />
        </ul>
      )}
    </CollapsibleCard>
  );
}

function InterpretationResult({ debugEnabled, response }: {
  debugEnabled: boolean;
  response: InterpretationResponse;
}) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => setCopyStatus('idle'), [response.malayalam_translation]);

  async function copyTranslation() {
    try {
      await writeToClipboard(response.malayalam_translation);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  return (
    <div className="sv-result-stack">
      <CollapsibleCard
        badge={`${Math.round(response.confidence * 100)}% confidence`}
        defaultExpanded
        icon="sparkles"
        title="Summary"
      >
        <p className="sv-summary-copy">
          {response.summary || 'No summary was returned for this content.'}
        </p>
      </CollapsibleCard>

      <CollapsibleCard defaultExpanded icon="translate" title="Malayalam Translation">
        <div className="sv-translation-toolbar">
          <span lang="ml">മലയാളം</span>
          <button
            aria-label="Copy Malayalam translation"
            disabled={!response.malayalam_translation}
            onClick={() => void copyTranslation()}
            type="button"
          >
            <UIIcon name={copyStatus === 'copied' ? 'check' : 'copy'} />
            {copyStatus === 'copied' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="sv-translation-scroll" lang="ml" tabIndex={0}>
          {response.malayalam_translation || 'മലയാള പരിഭാഷ ലഭ്യമല്ല.'}
        </div>
        <span aria-live="polite" className="sv-visually-hidden">
          {copyStatus === 'copied'
            ? 'Malayalam translation copied to clipboard.'
            : copyStatus === 'error'
              ? 'Malayalam translation could not be copied.'
              : ''}
        </span>
      </CollapsibleCard>

      <CollapsibleCard badge={`${response.key_points.length}`} icon="list" title="Key Points">
        {response.key_points.length > 0 ? (
          <ul className="sv-result-list">
            {response.key_points.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        ) : <EmptyCopy>No key points were returned.</EmptyCopy>}
      </CollapsibleCard>

      <CollapsibleCard badge={`${response.glossary.length}`} icon="book" title="Glossary">
        {response.glossary.length > 0 ? (
          <ul className="sv-glossary-list">
            {response.glossary.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        ) : <EmptyCopy>No glossary entries were returned.</EmptyCopy>}
      </CollapsibleCard>
      {debugEnabled && <DiagnosticCard response={response} />}
    </div>
  );
}

export function InterpretationPanel({
  debugEnabled = false,
  onDebugChange,
  onRetry,
  state,
}: InterpretationPanelProps) {
  const debugControl = onDebugChange && (
    <label className="sv-debug-toggle">
      <input
        checked={debugEnabled}
        onChange={(event) => onDebugChange(event.target.checked)}
        type="checkbox"
      />
      <span>ISL debugging</span>
    </label>
  );
  if (state.status === 'idle') {
    return (
      <>
        {debugControl}
        <div aria-live="polite" className="sv-state-card">
          <span className="sv-state-icon"><UIIcon name="clock" /></span>
          <div>
            <strong>Waiting for content</strong>
            <span>SignVerse will begin when readable text or captions are available.</span>
          </div>
        </div>
      </>
    );
  }

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" aria-live="polite" className="sv-loading-region">
        <span className="sv-visually-hidden">Loading interpretation results</span>
        <SkeletonCards />
      </div>
    );
  }

  if (state.status === 'error') {
    const details = ERROR_DETAILS[state.code];
    return (
      <section aria-live="assertive" className="sv-error-card" role="alert">
        <span className="sv-error-visual"><UIIcon name="alert" /></span>
        <div>
          <span className="sv-error-label">
            {state.code === 'extension-context-invalidated'
              ? 'Extension updated'
              : state.code === 'connection-failure'
                ? 'Offline'
                : 'Connection issue'}
          </span>
          <h3>{details.title}</h3>
          <p>{details.detail}</p>
          {state.message && <small className="sv-error-technical">{state.message}</small>}
          <button className="sv-retry-button" onClick={onRetry} type="button">
            <UIIcon name="refresh" />
            {state.code === 'extension-context-invalidated' ? 'Refresh page' : 'Retry'}
          </button>
        </div>
      </section>
    );
  }

  return <>{debugControl}<InterpretationResult debugEnabled={debugEnabled} response={state.response} /></>;
}
