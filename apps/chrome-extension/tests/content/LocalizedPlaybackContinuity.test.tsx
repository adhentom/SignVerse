import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamingInterpretation } from '../../content/interpretation/useStreamingInterpretation';
import type { ContentPacket } from '../../shared/contentPacket';
import type { InterpretationResponse, InterpretationState } from '../../shared/interpretation';

class ListenerChannel<T extends (...args: never[]) => void> {
  listeners = new Set<T>();
  addListener = (listener: T) => this.listeners.add(listener);
  removeListener = (listener: T) => this.listeners.delete(listener);
  emit(...args: Parameters<T>) { this.listeners.forEach((listener) => listener(...args)); }
}

function packet(text: string): ContentPacket {
  return {
    platform: 'website',
    title: 'Localized article',
    timestamp: new Date().toISOString(),
    text,
    metadata: { pageUrl: 'https://example.test/article', readingContext: 'pointer' },
  };
}

function response(label: string): InterpretationResponse {
  return {
    summary: label,
    malayalam_translation: label,
    key_points: [], keywords: [], glossary: [], isl_gloss: [label], confidence: 0.9,
    playback: {
      items: [{ token_id: label, asset_id: label, duration: 1, confidence: 0.9 }],
      unsupported_tokens: [],
    },
  };
}

function playbackTokens(state: InterpretationState): string[] {
  return state.status === 'ready'
    ? state.response.playback?.items.map((item) => item.token_id) ?? []
    : [];
}

function Probe({ value, onState }: {
  value: ContentPacket;
  onState(state: InterpretationState): void;
}) {
  const { state } = useStreamingInterpretation(value, 0, true);
  useEffect(() => onState(state), [state, onState]);
  return null;
}

describe('localized website playback continuity', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps active playback until the replacement context is interpreted', async () => {
    const onMessage = new ListenerChannel<(value: unknown) => void>();
    const onDisconnect = new ListenerChannel<() => void>();
    const postMessage = vi.fn();
    const port = {
      disconnect: vi.fn(), onDisconnect, onMessage, postMessage,
    } as unknown as chrome.runtime.Port;
    vi.stubGlobal('chrome', {
      runtime: { connect: vi.fn(() => port), lastError: undefined },
    });
    let state: InterpretationState = { status: 'idle' };
    const onState = (next: InterpretationState) => { state = next; };

    await act(async () => {
      root.render(<Probe onState={onState} value={packet('First readable paragraph.')} />);
    });
    onMessage.emit({ type: 'status', status: 'connected' });
    await act(async () => vi.runOnlyPendingTimersAsync());
    const firstContent = postMessage.mock.calls
      .map(([message]) => message as { type: string; sequence: number; session_id: string })
      .filter((message) => message.type === 'content').at(-1)!;
    await act(async () => {
      onMessage.emit({
        type: 'interpretation',
        sequence: firstContent.sequence,
        session_id: firstContent.session_id,
        data: response('FIRST'),
      });
    });
    expect(playbackTokens(state)).toEqual(['FIRST']);

    await act(async () => {
      root.render(<Probe onState={onState} value={packet('Second readable paragraph.')} />);
    });
    await act(async () => vi.runAllTimersAsync());
    expect(playbackTokens(state)).toEqual(['FIRST']);

    const secondContent = postMessage.mock.calls
      .map(([message]) => message as { type: string; sequence: number; session_id: string })
      .filter((message) => message.type === 'content').at(-1)!;
    await act(async () => {
      onMessage.emit({
        type: 'interpretation',
        sequence: firstContent.sequence,
        session_id: firstContent.session_id,
        data: response('STALE'),
      });
    });
    expect(playbackTokens(state)).toEqual(['FIRST']);

    await act(async () => {
      onMessage.emit({
        type: 'interpretation',
        sequence: secondContent.sequence,
        session_id: secondContent.session_id,
        data: response('SECOND'),
      });
    });
    expect(playbackTokens(state)).toEqual(['SECOND']);
  });
});
