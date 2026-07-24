import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnglishCaptionTrack } from '../../overlay/components/EnglishCaptionTrack';

describe('EnglishCaptionTrack', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('smoothly follows the avatar index on the shared timed segments', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(
      <EnglishCaptionTrack
        caption="one two three four"
        currentIndex={1}
        signDurations={[1, 3]}
      />,
    ));

    const current = container.querySelector('[aria-current="true"]');
    expect(current?.textContent).toBe('two three four');
    expect(current?.getAttribute('data-start')).toBe('1');
    expect(current?.getAttribute('data-end')).toBe('4');
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
    });

    act(() => root.unmount());
  });
});
