import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineProgress } from '../../overlay/components/PipelineProgress';

describe('PipelineProgress', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('animates through loading stages', () => {
    act(() => root.render(<PipelineProgress state={{ status: 'loading' }} />));
    expect(container.textContent).toContain('Reading Content');

    act(() => vi.advanceTimersByTime(1_300));
    expect(container.querySelector('[aria-current="step"]')?.textContent)
      .toContain('Generating ISL Gloss');
  });

  it('marks the pipeline ready', () => {
    act(() => root.render(<PipelineProgress state={{
      status: 'ready',
      response: {
        summary: '', malayalam_translation: '', key_points: [], keywords: [], glossary: [], isl_gloss: [], confidence: 0,
      },
    }} />));

    expect(container.textContent).toContain('Interpretation ready');
    expect(container.textContent).toContain('100%');
  });
});
