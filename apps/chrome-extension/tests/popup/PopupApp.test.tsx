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

    expect(container.textContent).toContain('SignVerse starts automatically on supported pages');
    expect(container.textContent).toContain('official captions are preferred');
    expect(container.textContent).toContain('status-only');
    expect(container.textContent).not.toContain('Listen to video audio');
    expect(container.textContent).not.toContain('Start listening');
    expect(container.textContent).not.toContain('Allow video audio');
  });

  it('requires no popup interaction on generic websites', async () => {
    installChrome('https://example.com/article');
    await renderPopup();

    expect(container.textContent).toContain('Automatic mode');
    expect(container.textContent).toContain('Running');
    expect(container.textContent).toContain('No popup action is required');
    expect(container.querySelector('button')).toBeNull();
  });

  it('reports automatic startup on Google Meet', async () => {
    installChrome('https://meet.google.com/abc-defg-hij');
    await renderPopup();

    expect(container.textContent).toContain('website, YouTube video, or Google Meet');
    expect(container.textContent).toContain('starts automatically');
    expect(container.querySelector('button')).toBeNull();
  });
});
