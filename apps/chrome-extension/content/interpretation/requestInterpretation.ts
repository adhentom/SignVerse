import {
  createInterpretContentRequest,
  isInterpretContentResponse,
} from '../../shared/backendMessages';
import type { ContentPacket } from '../../shared/contentPacket';
import type { InterpretationResponse } from '../../shared/interpretation';

export async function requestInterpretation(
  packet: ContentPacket,
): Promise<InterpretationResponse> {
  const request = createInterpretContentRequest(packet);
  const response: unknown = await chrome.runtime.sendMessage(request);

  if (!isInterpretContentResponse(response) || response.correlationId !== request.correlationId) {
    throw {
      code: 'invalid-response',
      message: 'The background service returned an invalid response.',
    };
  }

  if (!response.ok) {
    throw response.error;
  }

  return response.data;
}
