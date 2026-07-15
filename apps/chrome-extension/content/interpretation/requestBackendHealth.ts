import {
  createBackendHealthRequest,
  isBackendHealthResponse,
} from '../../shared/backendMessages';
import type { BackendHealth } from '../../shared/backendHealth';
import { sendRuntimeMessage } from './runtimeMessaging';

export async function requestBackendHealth(): Promise<BackendHealth> {
  const request = createBackendHealthRequest();
  console.info('[SignVerse] health_check_dispatched', {
    correlationId: request.correlationId,
  });
  const response: unknown = await sendRuntimeMessage(request);

  if (!isBackendHealthResponse(response) || response.correlationId !== request.correlationId) {
    console.error('[SignVerse] health_check_invalid_worker_response', {
      correlationId: request.correlationId,
    });
    throw {
      code: 'invalid-response',
      message: 'The background service returned an invalid health response.',
    };
  }

  if (!response.ok) throw response.error;
  console.info('[SignVerse] health_check_succeeded', {
    correlationId: request.correlationId,
    service: response.data.service,
    version: response.data.version,
  });
  return response.data;
}
