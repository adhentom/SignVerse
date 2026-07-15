import type { InterpretationErrorCode } from './interpretation';

export interface BackendHealth {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
}

export type BackendHealthState =
  | { status: 'checking' }
  | { status: 'connected'; health: BackendHealth }
  | { status: 'error'; code: InterpretationErrorCode; message: string };

export function isBackendHealth(value: unknown): value is BackendHealth {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BackendHealth>;
  return (
    candidate.status === 'ok' &&
    typeof candidate.service === 'string' &&
    typeof candidate.version === 'string' &&
    typeof candidate.environment === 'string'
  );
}
