import {
  createInterpretContentRequest,
  isInterpretContentResponse,
} from '../../shared/backendMessages';
import type { ContentPacket } from '../../shared/contentPacket';
import type { InterpretationResponse } from '../../shared/interpretation';
import { sendRuntimeMessage } from './runtimeMessaging';

export async function requestInterpretation(
  packet: ContentPacket,
): Promise<InterpretationResponse> {
  const request = createInterpretContentRequest(packet);
  console.info('[SignVerse] interpretation_request_dispatched', {
    correlationId: request.correlationId,
    platform: packet.platform,
  });
  const response: unknown = await sendRuntimeMessage(request);

  if (!isInterpretContentResponse(response) || response.correlationId !== request.correlationId) {
    throw {
      code: 'invalid-response',
      message: 'The background service returned an invalid response.',
    };
  }

  if (!response.ok) {
    throw response.error;
  }

  console.info('[SignVerse] interpretation_request_succeeded', {
    correlationId: request.correlationId,
  });
  return response.data;
}
