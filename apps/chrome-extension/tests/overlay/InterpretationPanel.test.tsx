import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('displays accessible collapsible result cards and copies Malayalam translation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    act(() => {
      root.render(<InterpretationPanel onRetry={vi.fn()} state={{
        status: 'ready',
        response: {
          summary: '',
          malayalam_translation: 'യോഗത്തിലേക്ക് സ്വാഗതം.',
          key_points: [],
          keywords: [],
          glossary: [],
          isl_gloss: [],
          confidence: 0,
        },
      }} />);
    });

    expect(container.textContent).toContain('Summary');
    expect(container.textContent).toContain('Malayalam Translation');
    expect(container.textContent).toContain('യോഗത്തിലേക്ക് സ്വാഗതം.');
    expect(container.textContent).toContain('Key Points');
    expect(container.textContent).toContain('Keywords');
    expect(container.textContent).toContain('Glossary');
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    expect(container.textContent).toContain('0%');

    const copyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy Malayalam translation"]',
    );
    await act(async () => copyButton?.click());
    expect(writeText).toHaveBeenCalledWith('യോഗത്തിലേക്ക് സ്വാഗതം.');
    expect(container.textContent).toContain('Copied');
  });

  it('announces backend failures and retries accessibly', () => {
    const retry = vi.fn();
    act(() => {
      root.render(<InterpretationPanel onRetry={retry} state={{
        status: 'error',
        code: 'backend-unavailable',
        message: 'The SignVerse backend is currently unavailable.',
      }} />);
    });

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain('backend is currently unavailable');
    const button = container.querySelector('button');
    act(() => button?.click());
    expect(retry).toHaveBeenCalledOnce();
  });
});
