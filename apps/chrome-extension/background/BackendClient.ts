import type { BackendConfig } from '../config/backendConfig';
import { isBackendHealth, type BackendHealth } from '../shared/backendHealth';
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

export interface BackendHealthClient {
  health(): Promise<BackendHealth>;
}

export class BackendClient implements InterpretationClient {
  constructor(
    private readonly config: BackendConfig,
    private readonly request: typeof fetch = fetch,
  ) {}

  async health(): Promise<BackendHealth> {
    const payload = await this.fetchJson('/health', { method: 'GET' });
    if (!isBackendHealth(payload)) {
      throw new BackendClientError(
        'invalid-response',
        'The SignVerse health endpoint returned an invalid response.',
      );
    }
    return payload;
  }

  async interpret(packet: ContentPacket): Promise<InterpretationResponse> {
    const payload = await this.fetchJson('/interpret', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(packet),
    });
    if (!isInterpretationResponse(payload)) {
      throw new BackendClientError(
        'invalid-response',
        'The SignVerse backend returned an invalid interpretation response.',
      );
    }
    return payload;
  }

  private async fetchJson(path: string, init: RequestInit): Promise<unknown> {
    if (!this.config.baseUrl) {
      throw new BackendClientError(
        'configuration',
        'The SignVerse backend URL is not configured for this extension build.',
      );
    }

    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    console.info('[SignVerse] backend_request_started', { method: init.method, url });

    try {
      const request = this.request;
      const response = await request(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...init.headers,
        },
        signal: controller.signal,
      });

      console.info('[SignVerse] backend_response_received', {
        method: init.method,
        status: response.status,
        url,
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

      return payload;
    } catch (error) {
      if (error instanceof BackendClientError) {
        throw error;
      }
      if (controller.signal.aborted) {
        console.warn(`[SignVerse] backend_request_timed_out ${init.method ?? 'GET'} ${url}`);
        throw new BackendClientError('timeout', 'The SignVerse backend request timed out.');
      }
      const reason = error instanceof Error ? error.message : 'Unknown fetch error';
      console.warn(
        `[SignVerse] backend_request_failed ${init.method ?? 'GET'} ${url}: ${reason}`,
      );
      throw new BackendClientError(
        'connection-failure',
        'The extension could not connect to the SignVerse backend.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
