import type { BackendConfig } from '../config/backendConfig';
import { isBackendHealth, type BackendHealth } from '../shared/backendHealth';
import type { ContentPacket } from '../shared/contentPacket';
import {
  isInterpretationResponse,
  type InterpretationErrorCode,
  type InterpretationResponse,
} from '../shared/interpretation';
import { runtimeDiagnostic } from '../shared/runtimeDiagnostics';

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
    const correlationId = crypto.randomUUID();
    runtimeDiagnostic('backend_request_started', {
      correlationId,
      method: init.method,
      path,
      url,
    });

    try {
      const request = this.request;
      const response = await request(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'X-Request-ID': correlationId,
          ...init.headers,
        },
        signal: controller.signal,
      });

      runtimeDiagnostic('backend_response_received', {
        correlationId,
        method: init.method,
        path,
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
        runtimeDiagnostic('backend_request_timed_out', {
          correlationId,
          method: init.method ?? 'GET',
          path,
          timeoutMs: this.config.timeoutMs,
          url,
        }, 'warn');
        throw new BackendClientError(
          'timeout',
          `${path === '/health' ? 'Health endpoint' : 'Interpretation request'} timed out.`,
        );
      }
      const reason = error instanceof Error ? error.message : 'Unknown fetch error';
      runtimeDiagnostic('backend_request_failed', {
        correlationId,
        method: init.method ?? 'GET',
        path,
        reason,
        url,
      }, 'warn');
      throw new BackendClientError(
        'connection-failure',
        path === '/health'
          ? 'Health endpoint failed. The backend is unreachable or the request was blocked by host permissions or CORS.'
          : 'Backend unreachable. The interpretation request could not reach the SignVerse service.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
