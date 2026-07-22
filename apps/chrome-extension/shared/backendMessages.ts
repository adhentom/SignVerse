import { isContentPacket, type ContentPacket } from './contentPacket';
import { isBackendHealth, type BackendHealth } from './backendHealth';
import {
  isInterpretationResponse,
  type InterpretationErrorCode,
  type InterpretationResponse,
} from './interpretation';

export const BACKEND_MESSAGE_SCHEMA_VERSION = 1 as const;

export interface InterpretContentRequest {
  schemaVersion: typeof BACKEND_MESSAGE_SCHEMA_VERSION;
  type: 'SIGNVERSE_INTERPRET_CONTENT';
  correlationId: string;
  packet: ContentPacket;
}

export interface BackendHealthRequest {
  schemaVersion: typeof BACKEND_MESSAGE_SCHEMA_VERSION;
  type: 'SIGNVERSE_CHECK_BACKEND_HEALTH';
  correlationId: string;
}

export type InterpretContentResponse =
  | {
      ok: true;
      correlationId: string;
      data: InterpretationResponse;
    }
  | {
      ok: false;
      correlationId: string;
      error: {
        code: InterpretationErrorCode;
        message: string;
      };
    };

export type BackendHealthResponse =
  | { ok: true; correlationId: string; data: BackendHealth }
  | {
      ok: false;
      correlationId: string;
      error: { code: InterpretationErrorCode; message: string };
    };

export function createBackendHealthRequest(): BackendHealthRequest {
  return {
    schemaVersion: BACKEND_MESSAGE_SCHEMA_VERSION,
    type: 'SIGNVERSE_CHECK_BACKEND_HEALTH',
    correlationId: crypto.randomUUID(),
  };
}

export function isBackendHealthRequest(value: unknown): value is BackendHealthRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BackendHealthRequest>;
  return (
    candidate.schemaVersion === BACKEND_MESSAGE_SCHEMA_VERSION &&
    candidate.type === 'SIGNVERSE_CHECK_BACKEND_HEALTH' &&
    typeof candidate.correlationId === 'string'
  );
}

export function isBackendHealthResponse(value: unknown): value is BackendHealthResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.ok !== 'boolean' || typeof candidate.correlationId !== 'string') {
    return false;
  }
  if (candidate.ok === true) return isBackendHealth(candidate.data);
  return isBackendError(candidate.error);
}

export function createInterpretContentRequest(packet: ContentPacket): InterpretContentRequest {
  return {
    schemaVersion: BACKEND_MESSAGE_SCHEMA_VERSION,
    type: 'SIGNVERSE_INTERPRET_CONTENT',
    correlationId: crypto.randomUUID(),
    packet,
  };
}

export function isInterpretContentRequest(value: unknown): value is InterpretContentRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<InterpretContentRequest>;
  return (
    candidate.schemaVersion === BACKEND_MESSAGE_SCHEMA_VERSION &&
    candidate.type === 'SIGNVERSE_INTERPRET_CONTENT' &&
    typeof candidate.correlationId === 'string' &&
    isContentPacket(candidate.packet)
  );
}

export function isInterpretContentResponse(value: unknown): value is InterpretContentResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.ok !== 'boolean' || typeof candidate.correlationId !== 'string') {
    return false;
  }

  if (candidate.ok === true) {
    return isInterpretationResponse(candidate.data);
  }

  return isBackendError(candidate.error);
}

function isBackendError(value: unknown): boolean {
  const error = value as Record<string, unknown> | null;
  const errorCodes = [
    'extension-context-invalidated',
    'configuration',
    'timeout',
    'connection-failure',
    'backend-unavailable',
    'invalid-response',
  ];
  return Boolean(
    error &&
    typeof error.code === 'string' && errorCodes.includes(error.code) &&
    typeof error.message === 'string',
  );
}
