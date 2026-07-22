import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignPlaybackPanel } from '../../overlay/components/SignPlaybackPanel';
import { readBorderBox } from '../../overlay/hooks/useInterpreterGeometry';

describe('SignPlaybackPanel', () => {
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

  it('displays ordered playback items, confidence, and unsupported tokens', () => {
    act(() => {
      root.render(<SignPlaybackPanel sourceText="Welcome everyone" state={{
        status: 'ready',
        response: {
          summary: '', malayalam_translation: 'എല്ലാവർക്കും സ്വാഗതം', key_points: [], keywords: [], glossary: [], isl_gloss: [], confidence: 0,
          playback: {
            items: [
              {
                token_id: 'greeting-hello',
                asset_id: 'asset-placeholder-hello',
                duration: 1.2,
                confidence: 0.75,
              },
            ],
            unsupported_tokens: ['object-water'],
          },
        },
      }} />);
    });

    expect(container.textContent).toContain('ISL Playback');
    expect(container.textContent).toContain('Current sign');
    expect(container.textContent).toContain('greeting-hello');
    expect(container.textContent).toContain('Dataset asset unavailable');
    expect(container.querySelector('select[aria-label="Interpreter avatar"]')).toBeNull();
    expect(container.querySelector('select[aria-label="Floating interpreter avatar"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Dock interpreter left"]')).toBeNull();
    expect(container.querySelector('input[aria-label="Floating interpreter opacity"]')).toBeNull();
    expect(container.querySelector('[aria-label="Move interpreter; use arrow keys or drag"]')).not.toBeNull();
    expect(container.textContent).toContain('object-water');
    expect(container.querySelector('input[aria-label="Playback timeline"]')).not.toBeNull();
    expect(container.textContent).toContain('English source');
    expect(container.querySelector('[lang="en"]')?.textContent).toContain('Welcome');
    expect(container.textContent).not.toContain('Malayalam captions');
    expect(container.querySelector('[lang="ml"]')).toBeNull();
    expect(container.querySelectorAll('.sv-player-controls button')).toHaveLength(4);
    expect(container.querySelector('select[aria-label="Playback speed"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="ISL avatar playback controller"]')?.getAttribute('tabindex')).toBe('0');
  });

  it('announces loading state', () => {
    act(() => root.render(<SignPlaybackPanel state={{ status: 'loading' }} />));

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).toContain('Preparing ISL playback');
  });

  it('explains when YouTube has no official caption track', () => {
    act(() => root.render(<SignPlaybackPanel
      sourceStatus="No official captions are available for this video."
      state={{
        status: 'ready',
        response: {
          summary: '', malayalam_translation: '', key_points: [], keywords: [], glossary: [],
          isl_gloss: [], confidence: 0, playback: { items: [], unsupported_tokens: [] },
        },
      }}
    />));

    expect(container.textContent).toContain('No official captions are available for this video.');
    expect(container.textContent).not.toContain('English source text is unavailable.');
  });

  it('fails closed when a permission-gated dataset asset is not distributed', () => {
    act(() => {
      root.render(<SignPlaybackPanel state={{
        status: 'ready',
        response: {
          summary: '', malayalam_translation: '', key_points: [], keywords: [], glossary: [], isl_gloss: ['HELP'], confidence: 0.9,
          playback: {
            items: [{
              token_id: 'action-help',
              asset_id: 'kaggle-animated-help-v1',
              duration: 2.36,
              confidence: 0.9,
            }],
            unsupported_tokens: [],
          },
        },
      }} />);
    });

    expect(container.textContent).toContain('Dataset asset unavailable');
    expect(container.textContent).not.toContain('Help · ISL sign');
  });

  it('supports keyboard movement and persists interpreter geometry', () => {
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => path },
      storage: { local: { get: vi.fn().mockResolvedValue({}), set } },
    });
    act(() => {
      root.render(<SignPlaybackPanel state={{
        status: 'ready',
        response: {
          summary: '', malayalam_translation: '', key_points: [], keywords: [], glossary: [], isl_gloss: [], confidence: 0,
          playback: { items: [], unsupported_tokens: [] },
        },
      }} />);
    });

    const handle = container.querySelector<HTMLButtonElement>(
      '[aria-label="Move interpreter; use arrow keys or drag"]',
    );
    act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' })));

    expect(container.querySelector<HTMLElement>('.sv-interpreter-overlay')?.style.left).toBe('34px');
    expect(document.body.textContent).toContain('Sign unavailable');
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      'signverse.interpreterGeometry': expect.objectContaining({ x: 34 }),
    }));
  });

  it('reads resized border-box dimensions instead of the smaller content box', () => {
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      width: 420, height: 560, x: 24, y: 80, top: 80, right: 444, bottom: 640, left: 24,
      toJSON: () => ({}),
    });

    expect(readBorderBox(element)).toEqual({ width: 420, height: 560 });
  });
});
