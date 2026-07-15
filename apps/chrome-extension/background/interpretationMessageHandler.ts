import {
  isInterpretContentRequest,
  type InterpretContentResponse,
} from '../shared/backendMessages';
import type { InterpretationErrorCode } from '../shared/interpretation';
import { BackendClientError, type InterpretationClient } from './BackendClient';

type SendResponse = (response: InterpretContentResponse) => void;

function normalizeError(error: unknown): { code: InterpretationErrorCode; message: string } {
  if (error instanceof BackendClientError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: 'connection-failure',
    message: 'The SignVerse backend request failed unexpectedly.',
  };
}

export function createInterpretationMessageHandler(client: InterpretationClient) {
  return (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
    if (!isInterpretContentRequest(message)) {
      return false;
    }

    void client.interpret(message.packet)
      .then((data) => {
        sendResponse({
          ok: true,
          correlationId: message.correlationId,
          data,
        });
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          correlationId: message.correlationId,
          error: normalizeError(error),
        });
      });

    return true;
  };
}
