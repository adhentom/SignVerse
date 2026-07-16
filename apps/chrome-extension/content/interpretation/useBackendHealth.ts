import { useCallback, useEffect, useState } from 'react';
import type { BackendHealthState } from '../../shared/backendHealth';
import type { InterpretationErrorCode } from '../../shared/interpretation';
import { requestBackendHealth } from './requestBackendHealth';

interface RequestError {
  code?: InterpretationErrorCode;
  message?: string;
}

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
    setState({ status: 'checking' });
    void requestBackendHealth()
      .then((health) => {
        if (!cancelled) setState({ status: 'connected', health });
      })
      .catch((error: RequestError) => {
        if (!cancelled) {
          setState({
            status: 'error',
            code: error.code ?? 'connection-failure',
            message: error.message ?? 'The SignVerse backend health check failed.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, enabled]);

  return { retry, state };
}
