import { useCallback, useEffect, useState } from 'react';
import type { ContentPacket } from '../../shared/contentPacket';
import type { InterpretationErrorCode, InterpretationState } from '../../shared/interpretation';
import { requestInterpretation } from './requestInterpretation';

interface RequestError {
  code?: InterpretationErrorCode;
  message?: string;
}

export function useInterpretation(
  packet: ContentPacket | null,
  debounceMs = 0,
): { retry: () => void; state: InterpretationState } {
  const [state, setState] = useState<InterpretationState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const packetKey = packet ? JSON.stringify(packet) : '';
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!packet) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setState({ status: 'loading' });
      void requestInterpretation(packet)
        .then((response) => {
          if (!cancelled) {
            setState({ status: 'ready', response });
          }
        })
        .catch((error: RequestError) => {
          if (!cancelled) {
            setState({
              status: 'error',
              code: error.code ?? 'connection-failure',
              message: error.message ?? 'Interpretation could not be completed.',
            });
          }
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [packetKey, debounceMs, attempt]);

  return { retry, state };
}
