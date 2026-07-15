import type { InterpretationErrorCode } from '../../shared/interpretation';

export interface RuntimeMessageError {
  code: InterpretationErrorCode;
  message: string;
}

export async function sendRuntimeMessage(message: unknown): Promise<unknown> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown runtime messaging error';
    const contextInvalidated = /extension context invalidated/i.test(message);
    const normalized: RuntimeMessageError = {
      code: contextInvalidated ? 'extension-context-invalidated' : 'connection-failure',
      message: contextInvalidated
        ? 'The extension was updated. Refresh this page to reconnect SignVerse.'
        : message,
    };
    console.warn('[SignVerse] runtime_message_failed', {
      code: normalized.code,
      error: message,
    });
    throw normalized;
  }
}
