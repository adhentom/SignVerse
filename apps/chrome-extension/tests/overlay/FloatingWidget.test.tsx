import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingWidget } from '../../overlay/FloatingWidget';

describe('FloatingWidget', () => {
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

  it('supports keyboard collapse and button-based reopening', () => {
    act(() => {
      root.render(
        <FloatingWidget
          backendHealthState={{
            status: 'connected',
            health: {
              status: 'ok',
              service: 'signverse-api',
              version: '0.1.0',
              environment: 'test',
            },
          }}
          contentState={{
            status: 'ready',
            content: {
              pageTitle: 'Example',
              pageUrl: 'https://example.com',
              headings: [],
              paragraphs: [],
            },
          }}
          interpretationState={{ status: 'idle' }}
          liveState={null}
          sourceText="Artificial intelligence helps computers solve problems."
          onRetry={vi.fn()}
          platform={{
            id: 'website',
            displayName: 'Generic website',
            modeLabel: 'Website Mode',
            statusLabel: 'Website Reading',
          }}
        />,
      );
    });

    const sidebar = container.querySelector('aside');
    expect(sidebar?.getAttribute('aria-label')).toContain('accessibility sidebar');
    expect(sidebar?.textContent).toContain('Connected');
    expect(container.querySelector('[aria-label="Interpreter processing status"]')?.textContent)
      .toContain('Captions');
    expect(container.querySelector('.sv-interpreter-overlay')).not.toBeNull();
    const openButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open SignVerse accessibility sidebar"]',
    );
    expect(openButton).not.toBeNull();
    expect(container.querySelector('.sv-interpreter-overlay')).not.toBeNull();
    act(() => openButton?.click());
    expect(sidebar?.hidden).toBe(false);
    const avatarSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Interpreter avatar"]',
    );
    expect(avatarSelect?.value).toBe('adult-female');
    expect(avatarSelect?.querySelectorAll('option')).toHaveLength(2);
    const minimizeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Minimize SignVerse sidebar"]',
    );
    act(() => minimizeButton?.click());
    expect(sidebar?.hidden).toBe(true);
    expect(container.querySelector('.sv-interpreter-overlay')).not.toBeNull();
    act(() => openButton?.click());
    act(() => sidebar?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
    expect(sidebar?.hidden).toBe(true);
  });

  it('offers page refresh recovery for an invalidated extension context', () => {
    const retry = vi.fn();
    act(() => {
      root.render(
        <FloatingWidget
          backendHealthState={{
            status: 'error',
            code: 'extension-context-invalidated',
            message: 'Refresh required.',
          }}
          contentState={{ status: 'loading' }}
          interpretationState={{ status: 'idle' }}
          liveState={null}
          sourceText=""
          onRetry={retry}
          platform={{
            id: 'website',
            displayName: 'Generic website',
            modeLabel: 'Website Mode',
            statusLabel: 'Website Reading',
          }}
        />,
      );
    });

    expect(container.textContent).toContain('Refresh required');
    const refresh = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Refresh page to reconnect SignVerse"]',
    );
    act(() => refresh?.click());
    expect(retry).toHaveBeenCalledOnce();
  });

  it('keeps translation in the sidebar and treats empty playback as attention, not an error', () => {
    act(() => {
      root.render(
        <FloatingWidget
          backendHealthState={{
            status: 'connected',
            health: {
              status: 'ok',
              service: 'signverse-api',
              version: '0.1.0',
              environment: 'test',
            },
          }}
          contentState={{ status: 'loading' }}
          interpretationState={{
            status: 'ready',
            response: {
              summary: 'A short summary.',
              malayalam_translation: 'ഇത് മലയാളം പരിഭാഷയാണ്.',
              key_points: [],
              keywords: [],
              glossary: [],
              isl_gloss: [],
              confidence: 0.8,
              playback: { items: [], unsupported_tokens: [] },
            },
          }}
          liveState={null}
          sourceText="This English source must not appear in the floating interpreter."
          onRetry={vi.fn()}
          platform={{
            id: 'youtube',
            displayName: 'YouTube',
            modeLabel: 'YouTube Mode',
            statusLabel: 'YouTube Interpretation',
          }}
        />,
      );
    });

    const openButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open SignVerse accessibility sidebar"]',
    );
    act(() => openButton?.click());

    const sidebar = container.querySelector('aside');
    const floatingInterpreter = container.querySelector('.sv-floating-interpreter-root');
    expect(sidebar?.textContent).toContain('Malayalam Translation');
    expect(sidebar?.textContent).toContain('ഇത് മലയാളം പരിഭാഷയാണ്.');
    expect(floatingInterpreter?.textContent).not.toContain('ഇത് മലയാളം പരിഭാഷയാണ്.');
    expect(floatingInterpreter?.textContent)
      .not.toContain('This English source must not appear in the floating interpreter.');
    expect(floatingInterpreter?.querySelector('.sv-floating-caption')).toBeNull();
    const errorStatus = [...container.querySelectorAll('.sv-status-indicator')]
      .find((status) => status.textContent === 'Error');
    expect(errorStatus?.getAttribute('aria-current')).toBeNull();
    expect(errorStatus?.classList.contains('sv-status-indicator--error')).toBe(false);
    expect(floatingInterpreter?.querySelector('.sv-interpreter-status')?.textContent)
      .toContain('Attention needed');
  });

  it('announces transcript, backend, and processing states without hiding retry', () => {
    const retry = vi.fn();
    act(() => {
      root.render(
        <FloatingWidget
          backendHealthState={{
            status: 'error',
            code: 'connection-failure',
            message: 'The backend could not be reached.',
          }}
          contentState={{ status: 'loading' }}
          interpretationState={{ status: 'idle' }}
          liveState={{
            status: 'no-captions',
            statusMessage: 'No transcript is available.',
            title: 'Video',
            timestamp: '00:00',
            metadata: {},
            currentPacket: null,
            history: [],
          }}
          sourceText=""
          onRetry={retry}
          platform={{
            id: 'youtube',
            displayName: 'YouTube',
            modeLabel: 'YouTube Mode',
            statusLabel: 'YouTube Interpretation',
          }}
        />,
      );
    });

    const openButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open SignVerse accessibility sidebar"]',
    );
    act(() => openButton?.click());
    expect(container.textContent).toContain('Backend unreachable');
    expect(container.textContent).toContain('Transcript unavailable');
    expect(container.querySelector('.sv-status-indicator--error')?.textContent).toBe('Error');
    const retryButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Retry connection'));
    act(() => retryButton?.click());
    expect(retry).toHaveBeenCalledOnce();
  });

});
