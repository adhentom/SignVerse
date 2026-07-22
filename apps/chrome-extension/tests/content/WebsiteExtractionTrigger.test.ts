import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '../../content/adapters/PlatformAdapter';
import { GenericWebsiteAdapter } from '../../content/generic-web/GenericWebsiteAdapter';
import {
  startWebsiteExtraction,
  WEBSITE_CONTEXT_DEBOUNCE_MS,
} from '../../content/interpretation/startWebsiteExtraction';

const emptyContent = {
  pageTitle: 'Loading article',
  pageUrl: 'https://example.test/article',
  headings: [],
  paragraphs: [],
};
const articleContent = {
  ...emptyContent,
  pageTitle: 'Long article',
  headings: [{ level: 1 as const, text: 'Long article' }],
  paragraphs: ['A readable article paragraph.'],
};
const firstLocalizedParagraph = 'The first localized paragraph contains enough meaningful article context for accurate and accessible interpretation.';
const secondLocalizedParagraph = 'The second localized paragraph contains enough distinct readable context to trigger a new interpretation.';

describe('website extraction trigger', () => {
  afterEach(() => vi.useRealTimers());

  it('runs without requestAnimationFrame and retries until readable content appears', async () => {
    vi.useFakeTimers();
    const extractContent = vi.fn()
      .mockReturnValueOnce(emptyContent)
      .mockReturnValue(articleContent);
    const adapter: PlatformAdapter = {
      platform: {
        id: 'website', displayName: 'Website', modeLabel: 'Website Mode', statusLabel: 'Website Reading',
      },
      matches: () => true,
      extractContent,
    };
    const results: Array<{ packet: unknown }> = [];
    const stop = startWebsiteExtraction(adapter, (result) => results.push(result), vi.fn());

    await vi.runOnlyPendingTimersAsync();
    expect(extractContent).toHaveBeenCalledTimes(1);
    expect(results[0].packet).toBeNull();

    document.body.append(document.createElement('article'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(WEBSITE_CONTEXT_DEBOUNCE_MS);

    expect(extractContent).toHaveBeenCalledTimes(2);
    expect(results[1].packet).toMatchObject({
      platform: 'website',
      title: 'Long article',
      text: expect.stringContaining('A readable article paragraph.'),
    });
    document.body.append(document.createElement('section'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(WEBSITE_CONTEXT_DEBOUNCE_MS);
    expect(extractContent).toHaveBeenCalledTimes(3);
    stop();
  });

  it('debounces pointer movement and emits only the active semantic block', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([{} as DOMRect] as unknown as DOMRectList);
    document.title = 'Reading context';
    document.body.innerHTML = `
      <main>
        <p id="first">${firstLocalizedParagraph}</p>
        <p id="second">${secondLocalizedParagraph}</p>
      </main>
    `;
    const results: Array<{ packet: { text: string } | null }> = [];
    const stop = startWebsiteExtraction(
      new GenericWebsiteAdapter(),
      (result) => results.push(result),
      vi.fn(),
    );

    await vi.runOnlyPendingTimersAsync();
    expect(results.at(-1)?.packet?.text).toBe(firstLocalizedParagraph);

    const second = document.querySelector('#second')!;
    second.dispatchEvent(new MouseEvent('pointermove', {
      bubbles: true, clientX: 20, clientY: 20,
    }));
    await vi.advanceTimersByTimeAsync(WEBSITE_CONTEXT_DEBOUNCE_MS - 1);
    expect(results).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(results.at(-1)?.packet?.text).toBe(secondLocalizedParagraph);

    second.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WEBSITE_CONTEXT_DEBOUNCE_MS);
    expect(results).toHaveLength(2);

    stop();
    document.querySelector('#first')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WEBSITE_CONTEXT_DEBOUNCE_MS);
    expect(results).toHaveLength(2);
  });
});
