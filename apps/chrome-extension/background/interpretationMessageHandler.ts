import {
  isBackendHealthRequest,
  isInterpretContentRequest,
  type BackendHealthResponse,
  type InterpretContentResponse,
} from '../shared/backendMessages';
import type { InterpretationErrorCode } from '../shared/interpretation';
import {
  BackendClientError,
  type BackendHealthClient,
  type InterpretationClient,
} from './BackendClient';

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

    console.info('[SignVerse] interpretation_message_received', {
      correlationId: message.correlationId,
      platform: message.packet.platform,
    });

    void client.interpret(message.packet)
      .then((data) => {
        sendResponse({
          ok: true,
          correlationId: message.correlationId,
          data,
        });
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : 'Unknown interpretation error';
        console.warn(
          `[SignVerse] interpretation_request_failed ${message.correlationId}: ${reason}`,
        );
        sendResponse({
          ok: false,
          correlationId: message.correlationId,
          error: normalizeError(error),
        });
      });

    return true;
  };
}

export function createBackendHealthMessageHandler(client: BackendHealthClient) {
  return (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: BackendHealthResponse) => void,
  ) => {
    if (!isBackendHealthRequest(message)) return false;

    console.info('[SignVerse] health_message_received', {
      correlationId: message.correlationId,
    });
    void client.health()
      .then((data) => sendResponse({
        ok: true,
        correlationId: message.correlationId,
        data,
      }))
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : 'Unknown health error';
        console.warn(`[SignVerse] health_request_failed ${message.correlationId}: ${reason}`);
        sendResponse({
          ok: false,
          correlationId: message.correlationId,
          error: normalizeError(error),
        });
      });
    return true;
  };
}
