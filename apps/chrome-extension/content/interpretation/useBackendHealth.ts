import { useCallback, useEffect, useState } from 'react';
import type { BackendHealthState } from '../../shared/backendHealth';
import type { InterpretationErrorCode } from '../../shared/interpretation';
import { requestBackendHealth } from './requestBackendHealth';

interface RequestError {
  code?: InterpretationErrorCode;
  message?: string;
}

const AUTO_RETRY_BASE_DELAY_MS = 2_000;
const AUTO_RETRY_MAX_DELAY_MS = 15_000;
const RETRYABLE_HEALTH_ERRORS = new Set<InterpretationErrorCode>([
  'backend-unavailable',
  'connection-failure',
  'timeout',
]);

export function useBackendHealth(enabled = true): { retry: () => void; state: BackendHealthState } {
  const [state, setState] = useState<BackendHealthState>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'checking' });
      return;
    }
    let cancelled = false;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    setState({ status: 'checking' });

    const checkHealth = async (): Promise<void> => {
      try {
        const health = await requestBackendHealth();
        if (!cancelled) setState({ status: 'connected', health });
      } catch (error) {
        if (cancelled) return;
        const requestError = error as RequestError;
        const code = requestError.code ?? 'connection-failure';
        const message = requestError.message ?? 'The SignVerse backend health check failed.';
        setState((current) => (
          current.status === 'error' &&
          current.code === code &&
          current.message === message
            ? current
            : { status: 'error', code, message }
        ));

        if (RETRYABLE_HEALTH_ERRORS.has(code)) {
          const delay = Math.min(
            AUTO_RETRY_BASE_DELAY_MS * (2 ** retryCount),
            AUTO_RETRY_MAX_DELAY_MS,
          );
          retryCount = Math.min(retryCount + 1, 4);
          retryTimer = setTimeout(() => {
            void checkHealth();
          }, delay);
        }
      }
    };

    void checkHealth();

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [attempt, enabled]);

  return { retry, state };
}
