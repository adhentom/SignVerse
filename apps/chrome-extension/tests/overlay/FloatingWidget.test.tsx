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
    act(() => sidebar?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));

    const openButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open SignVerse accessibility sidebar"]',
    );
    expect(openButton).not.toBeNull();
    act(() => openButton?.click());
    expect(container.querySelector('aside')).not.toBeNull();
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
