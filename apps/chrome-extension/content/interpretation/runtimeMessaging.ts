import type { InterpretationErrorCode } from '../../shared/interpretation';

export interface RuntimeMessageError {
  code: InterpretationErrorCode;
  message: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Unknown runtime messaging error';
}

export async function sendRuntimeMessage(message: unknown): Promise<unknown> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    const message = errorMessage(error);
    const contextInvalidated = /extension context invalidated/i.test(message);
    const normalized: RuntimeMessageError = {
      code: contextInvalidated ? 'extension-context-invalidated' : 'connection-failure',
      message: contextInvalidated
        ? 'The extension was updated. Refresh this page to reconnect SignVerse.'
        : message,
    };
    const diagnostic =
      `[SignVerse] runtime_message_failed code=${normalized.code} error=${message}`;
    if (contextInvalidated) console.info(diagnostic);
    else console.warn(diagnostic);
    throw normalized;
  }
}
