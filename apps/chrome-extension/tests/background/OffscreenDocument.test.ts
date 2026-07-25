import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureAudioOffscreenDocument } from '../../background/offscreenDocument';

describe('audio offscreen document compatibility', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses runtime contexts on Chrome versions before offscreen.hasDocument', async () => {
    const createDocument = vi.fn(async () => undefined);
    const getContexts = vi.fn(async () => []);
    vi.stubGlobal('chrome', {
      offscreen: {
        createDocument,
        hasDocument: undefined,
        Reason: { USER_MEDIA: 'USER_MEDIA' },
      },
      runtime: {
        ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
        getContexts,
        getURL: (path: string) => `chrome-extension://signverse/${path}`,
      },
    });

    await ensureAudioOffscreenDocument();

    expect(getContexts).toHaveBeenCalledWith({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: ['chrome-extension://signverse/offscreen.html'],
    });
    expect(createDocument).toHaveBeenCalledOnce();
  });

  it('does not create a duplicate offscreen document', async () => {
    const createDocument = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      offscreen: {
        createDocument,
        hasDocument: vi.fn(async () => true),
        Reason: { USER_MEDIA: 'USER_MEDIA' },
      },
      runtime: {
        ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
        getContexts: vi.fn(),
        getURL: vi.fn(),
      },
    });

    await ensureAudioOffscreenDocument();

    expect(createDocument).not.toHaveBeenCalled();
  });
});
