import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupApp } from '../../popup/PopupApp';

describe('PopupApp production controls', () => {
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
    vi.unstubAllGlobals();
  });

  function installChrome(url: string) {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ signverseVisible: false })),
          set: vi.fn(async () => undefined),
        },
      },
      tabs: {
        query: vi.fn(async () => [{
          id: 9,
          title: 'Accessible video',
          url,
        }]),
      },
    });
  }

  async function renderPopup() {
    await act(async () => root.render(<PopupApp />));
    await act(async () => undefined);
  }

  it('shows automatic YouTube startup without manual audio controls', async () => {
    installChrome('https://www.youtube.com/watch?v=test');
    await renderPopup();

    expect(container.textContent).toContain('SignVerse starts automatically on YouTube');
    expect(container.textContent).not.toContain('Listen to video audio');
    expect(container.textContent).not.toContain('Start listening');
    expect(container.textContent).not.toContain('Allow video audio');
  });

  it('retains the visibility control for non-YouTube pages', async () => {
    installChrome('https://example.com/article');
    await renderPopup();

    expect(container.textContent).toContain('Show SignVerse on pages');
    expect(container.textContent).not.toContain('SignVerse starts automatically on YouTube');
  });
});
