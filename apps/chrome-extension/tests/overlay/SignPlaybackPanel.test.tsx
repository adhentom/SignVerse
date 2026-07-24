import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignPlaybackPanel } from '../../overlay/components/SignPlaybackPanel';
import { segmentCaption } from '../../overlay/components/EnglishCaptionTrack';
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
    expect(container.textContent).toContain('No approved animation found');
    expect(container.textContent).toContain('asset-placeholder-hello');
    expect(container.querySelector('select[aria-label="Interpreter avatar"]')).toBeNull();
    expect(container.querySelector('select[aria-label="Floating interpreter avatar"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Dock interpreter left"]')).toBeNull();
    expect(container.querySelector('input[aria-label="Floating interpreter opacity"]')).toBeNull();
    expect(container.querySelector('[aria-label="Move interpreter; use arrow keys or drag"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Minimize interpreter"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Close interpreter"]')).not.toBeNull();
    expect(container.querySelector('.sv-floating-caption')?.textContent).toContain('Welcome');
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

  it('minimizes, closes, and restores the floating interpreter while retaining captions', () => {
    const portal = document.createElement('div');
    document.body.append(portal);
    act(() => {
      root.render(<SignPlaybackPanel
        portalTarget={portal}
        sourceText="Speech remains visible"
        state={{
          status: 'ready',
          response: {
            summary: '', malayalam_translation: '', key_points: [], keywords: [], glossary: [],
            isl_gloss: [], confidence: 0, playback: { items: [], unsupported_tokens: [] },
          },
        }}
      />);
    });

    const minimize = portal.querySelector<HTMLButtonElement>('[aria-label="Minimize interpreter"]');
    const caption = portal.querySelector('.sv-floating-caption');
    const avatar = portal.querySelector('.sv-interpreter-avatar-area');
    const currentSign = portal.querySelector('.sv-current-sign');
    expect(caption).not.toBeNull();
    expect(avatar).not.toBeNull();
    expect(currentSign).not.toBeNull();
    expect(caption!.compareDocumentPosition(avatar!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(avatar!.compareDocumentPosition(currentSign!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(portal.querySelector('.sv-interpreter-status')?.textContent)
      .toContain('Attention needed');
    act(() => minimize?.click());
    expect(portal.querySelector('.sv-interpreter-overlay--minimized')).not.toBeNull();
    expect(portal.querySelector('.sv-floating-caption')?.textContent).toContain('Speech remains visible');

    const close = portal.querySelector<HTMLButtonElement>('[aria-label="Close interpreter"]');
    act(() => close?.click());
    expect(portal.querySelector('.sv-interpreter-overlay')).toBeNull();

    const restore = portal.querySelector<HTMLButtonElement>('[aria-label="Show SignVerse interpreter"]');
    act(() => restore?.click());
    expect(portal.querySelector('.sv-interpreter-overlay')).not.toBeNull();
    portal.remove();
  });

  it('segments floating captions in playback order', () => {
    expect(segmentCaption('one two three four', 2)).toEqual(['one two', 'three four']);
  });

  it('announces loading state', () => {
    act(() => root.render(<SignPlaybackPanel state={{ status: 'loading' }} />));

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).toContain('Preparing ISL playback');
  });

  it('shows the floating audio caption while interpretation is still loading', () => {
    const portal = document.createElement('div');
    document.body.append(portal);
    act(() => root.render(<SignPlaybackPanel
      portalTarget={portal}
      sourceText="Audio transcription is ready."
      state={{ status: 'loading' }}
    />));

    expect(portal.querySelector('.sv-floating-caption')?.textContent)
      .toContain('Audio transcription is ready.');
    expect(portal.querySelector('[aria-label="Floating SignVerse interpreter"]')).not.toBeNull();
    portal.remove();
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

    expect(container.textContent).toContain('No approved animation found');
    expect(container.textContent).toContain('kaggle-animated-help-v1');
    expect(container.textContent).not.toContain('Help · ISL sign');
  });

  it('diagnoses a valid backend response with no governed gloss or playback', () => {
    act(() => {
      root.render(<SignPlaybackPanel state={{
        status: 'ready',
        response: {
          summary: '',
          malayalam_translation: '',
          key_points: [],
          keywords: [],
          glossary: [],
          isl_gloss: [],
          confidence: 0,
          playback: { items: [], unsupported_tokens: [] },
        },
      }} />);
    });

    expect(container.textContent).toContain('PlaybackSequence empty');
    expect(container.textContent)
      .toContain('The interpretation provider returned no governed ISL gloss.');
    expect(container.textContent).not.toContain('Preparing interpretation');
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
    expect(document.body.textContent).toContain('PlaybackSequence empty');
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      'signverse.interpreterGeometry': expect.objectContaining({ x: 34 }),
    }));
  });

  it('restores the saved interpreter position and size', async () => {
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => path },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            'signverse.interpreterGeometry': {
              x: 48,
              y: 36,
              width: 420,
              height: 620,
            },
          }),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
    await act(async () => {
      root.render(<SignPlaybackPanel state={{
        status: 'ready',
        response: {
          summary: '', malayalam_translation: '', key_points: [], keywords: [], glossary: [],
          isl_gloss: [], confidence: 0, playback: { items: [], unsupported_tokens: [] },
        },
      }} />);
      await Promise.resolve();
    });

    const overlay = container.querySelector<HTMLElement>('.sv-interpreter-overlay');
    expect(overlay?.style.left).toBe('48px');
    expect(overlay?.style.top).toBe('36px');
    expect(overlay?.style.width).toBe('420px');
    expect(overlay?.style.height).toBe('620px');
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
