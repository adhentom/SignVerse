import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignPlaybackPanel } from '../../overlay/components/SignPlaybackPanel';

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
  });

  it('displays ordered playback items, confidence, and unsupported tokens', () => {
    act(() => {
      root.render(<SignPlaybackPanel state={{
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
    expect(container.textContent).toContain('Animated avatar demo');
    expect(container.textContent).toContain('Current sign');
    expect(container.textContent).toContain('greeting-hello');
    expect(container.textContent).toContain('glb');
    expect(container.querySelector('select[aria-label="Interpreter avatar"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Drag interpreter"]')).not.toBeNull();
    expect(container.textContent).toContain('75%');
    expect(container.textContent).toContain('object-water');
    expect(container.querySelector('input[aria-label="Playback timeline"]')).not.toBeNull();
    expect(container.textContent).toContain('Malayalam captions');
    expect(container.querySelector('[lang="ml"]')?.textContent).toContain('സ്വാഗതം');
    expect(container.querySelectorAll('.sv-player-controls button')).toHaveLength(4);
    expect(container.querySelector('select[aria-label="Playback speed"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="ISL avatar playback controller"]')?.getAttribute('tabindex')).toBe('0');
  });

  it('announces loading state', () => {
    act(() => root.render(<SignPlaybackPanel state={{ status: 'loading' }} />));

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).toContain('Preparing ISL playback');
  });
});
