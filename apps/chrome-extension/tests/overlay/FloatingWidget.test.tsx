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

});
