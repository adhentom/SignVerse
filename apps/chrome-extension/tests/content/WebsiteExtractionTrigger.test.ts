import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '../../content/adapters/PlatformAdapter';
import { startWebsiteExtraction } from '../../content/interpretation/startWebsiteExtraction';

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
    await vi.advanceTimersByTimeAsync(100);

    expect(extractContent).toHaveBeenCalledTimes(2);
    expect(results[1].packet).toMatchObject({
      platform: 'website',
      title: 'Long article',
      text: expect.stringContaining('A readable article paragraph.'),
    });
    document.body.append(document.createElement('section'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(extractContent).toHaveBeenCalledTimes(3);
    stop();
  });
});
