import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackendHealth } from '../../content/interpretation/useBackendHealth';

const { requestBackendHealthMock } = vi.hoisted(() => ({
  requestBackendHealthMock: vi.fn(),
}));

vi.mock('../../content/interpretation/requestBackendHealth', () => ({
  requestBackendHealth: requestBackendHealthMock,
}));

const health = {
  status: 'ok' as const,
  service: 'signverse-api',
  version: '0.1.0',
  environment: 'test',
};

function Harness({ enabled = true }: { enabled?: boolean }) {
  const { retry, state } = useBackendHealth(enabled);
  return (
    <div>
      <output>{state.status}</output>
      <button type="button" onClick={retry}>Retry</button>
    </div>
  );
}

describe('useBackendHealth recovery', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    requestBackendHealthMock.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('automatically recovers when a temporarily unavailable backend returns', async () => {
    requestBackendHealthMock
      .mockRejectedValueOnce({ code: 'connection-failure', message: 'Backend unreachable.' })
      .mockResolvedValueOnce(health);

    await act(async () => root.render(<Harness />));
    expect(container.querySelector('output')?.textContent).toBe('error');
    expect(requestBackendHealthMock).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(1_999));
    expect(requestBackendHealthMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output')?.textContent).toBe('error');

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(requestBackendHealthMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('output')?.textContent).toBe('connected');
  });

  it('does not retry a non-recoverable invalid response', async () => {
    requestBackendHealthMock.mockRejectedValue({
      code: 'invalid-response',
      message: 'Invalid health response.',
    });

    await act(async () => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(requestBackendHealthMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output')?.textContent).toBe('error');
  });

  it('cancels a pending automatic retry when health checks are disabled', async () => {
    requestBackendHealthMock.mockRejectedValue({
      code: 'backend-unavailable',
      message: 'Backend unavailable.',
    });

    await act(async () => root.render(<Harness />));
    await act(async () => root.render(<Harness enabled={false} />));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(requestBackendHealthMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output')?.textContent).toBe('checking');
  });
});
