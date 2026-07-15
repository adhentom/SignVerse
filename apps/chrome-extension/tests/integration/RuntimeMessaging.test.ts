import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendRuntimeMessage } from '../../content/interpretation/runtimeMessaging';

describe('runtime messaging diagnostics', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('classifies stale content scripts after an extension reload', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockRejectedValue(new Error('Extension context invalidated.')),
      },
    });

    await expect(sendRuntimeMessage({ type: 'TEST' })).rejects.toEqual({
      code: 'extension-context-invalidated',
      message: 'The extension was updated. Refresh this page to reconnect SignVerse.',
    });
  });
});
