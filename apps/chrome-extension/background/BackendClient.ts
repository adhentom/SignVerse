import type { BackendConfig } from '../config/backendConfig';
import type { ContentPacket } from '../shared/contentPacket';
import {
  isInterpretationResponse,
  type InterpretationErrorCode,
  type InterpretationResponse,
} from '../shared/interpretation';

export class BackendClientError extends Error {
  constructor(
    readonly code: InterpretationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackendClientError';
  }
}

export interface InterpretationClient {
  interpret(packet: ContentPacket): Promise<InterpretationResponse>;
}

export class BackendClient implements InterpretationClient {
  constructor(
    private readonly config: BackendConfig,
    private readonly request: typeof fetch = fetch,
  ) {}

  async interpret(packet: ContentPacket): Promise<InterpretationResponse> {
    if (!this.config.baseUrl) {
      throw new BackendClientError(
        'configuration',
        'The SignVerse backend URL is not configured for this extension build.',
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.request(`${this.config.baseUrl}/interpret`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(packet),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BackendClientError(
          response.status >= 500 ? 'backend-unavailable' : 'invalid-response',
          response.status >= 500
            ? 'The SignVerse backend is currently unavailable.'
            : 'The SignVerse backend rejected the content packet.',
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new BackendClientError(
          'invalid-response',
          'The SignVerse backend returned unreadable data.',
        );
      }

      if (!isInterpretationResponse(payload)) {
        throw new BackendClientError(
          'invalid-response',
          'The SignVerse backend returned an invalid interpretation response.',
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof BackendClientError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new BackendClientError('timeout', 'The SignVerse backend request timed out.');
      }
      throw new BackendClientError(
        'connection-failure',
        'The extension could not connect to the SignVerse backend.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
