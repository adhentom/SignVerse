import { useEffect, useState } from 'react';
import type {
  InterpretationErrorCode,
  InterpretationResponse,
  InterpretationState,
} from '../../shared/interpretation';
import { CollapsibleCard } from './CollapsibleCard';
import { UIIcon } from './UIIcon';

interface InterpretationPanelProps {
  onRetry: () => void;
  state: InterpretationState;
}

const ERROR_DETAILS: Record<InterpretationErrorCode, { title: string; detail: string }> = {
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

function InterpretationResult({ response }: { response: InterpretationResponse }) {
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

      <CollapsibleCard badge={`${response.keywords.length}`} icon="key" title="Keywords">
        {response.keywords.length > 0 ? (
          <ul className="sv-chip-list">
            {response.keywords.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        ) : <EmptyCopy>No keywords were returned.</EmptyCopy>}
      </CollapsibleCard>

      <CollapsibleCard badge={`${response.glossary.length}`} icon="book" title="Glossary">
        {response.glossary.length > 0 ? (
          <ul className="sv-glossary-list">
            {response.glossary.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        ) : <EmptyCopy>No glossary entries were returned.</EmptyCopy>}
      </CollapsibleCard>
    </div>
  );
}

export function InterpretationPanel({ onRetry, state }: InterpretationPanelProps) {
  if (state.status === 'idle') {
    return (
      <div aria-live="polite" className="sv-state-card">
        <span className="sv-state-icon"><UIIcon name="clock" /></span>
        <div>
          <strong>Waiting for content</strong>
          <span>SignVerse will begin when readable text or captions are available.</span>
        </div>
      </div>
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
            {state.code === 'connection-failure' ? 'Offline' : 'Connection issue'}
          </span>
          <h3>{details.title}</h3>
          <p>{details.detail}</p>
          {state.message && <small className="sv-error-technical">{state.message}</small>}
          <button className="sv-retry-button" onClick={onRetry} type="button">
            <UIIcon name="refresh" />
            Retry
          </button>
        </div>
      </section>
    );
  }

  return <InterpretationResult response={state.response} />;
}
