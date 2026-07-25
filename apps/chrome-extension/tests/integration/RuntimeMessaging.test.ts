import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendRuntimeMessage } from '../../content/interpretation/runtimeMessaging';

describe('runtime messaging diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('classifies stale content scripts after an extension reload', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockRejectedValue(new Error('Extension context invalidated.')),
      },
    });

    await expect(sendRuntimeMessage({ type: 'TEST' })).rejects.toEqual({
      code: 'extension-context-invalidated',
      message: 'The extension was updated. Refresh this page to reconnect SignVerse.',
    });
    expect(info).toHaveBeenCalledWith(expect.stringContaining(
      'runtime_message_failed code=extension-context-invalidated',
    ));
    expect(warn).not.toHaveBeenCalled();
  });

  it('classifies object-shaped reload errors without producing a warning badge', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockRejectedValue({ message: 'Extension context invalidated.' }),
      },
    });

    await expect(sendRuntimeMessage({ type: 'TEST' })).rejects.toEqual({
      code: 'extension-context-invalidated',
      message: 'The extension was updated. Refresh this page to reconnect SignVerse.',
    });
    expect(info).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it('retains a warning for unexpected runtime messaging failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockRejectedValue(new Error('Receiving end does not exist.')),
      },
    });

    await expect(sendRuntimeMessage({ type: 'TEST' })).rejects.toEqual({
      code: 'connection-failure',
      message: 'Receiving end does not exist.',
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(
      'runtime_message_failed code=connection-failure',
    ));
  });
});
