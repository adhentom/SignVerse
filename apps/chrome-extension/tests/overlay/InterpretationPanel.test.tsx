import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InterpretationPanel } from '../../overlay/components/InterpretationPanel';

describe('InterpretationPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('displays every field in the mock backend response', () => {
    act(() => {
      root.render(<InterpretationPanel state={{
        status: 'ready',
        response: {
          summary: '',
          key_points: [],
          keywords: [],
          glossary: [],
          isl_gloss: [],
          confidence: 0,
        },
      }} />);
    });

    expect(container.textContent).toContain('Summary');
    expect(container.textContent).toContain('Key points');
    expect(container.textContent).toContain('Keywords');
    expect(container.textContent).toContain('Glossary');
    expect(container.textContent).toContain('ISL Gloss');
    expect(container.textContent).toContain('0%');
  });

  it('announces backend failures accessibly', () => {
    act(() => {
      root.render(<InterpretationPanel state={{
        status: 'error',
        code: 'backend-unavailable',
        message: 'The SignVerse backend is currently unavailable.',
      }} />);
    });

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain('backend is currently unavailable');
  });
});
