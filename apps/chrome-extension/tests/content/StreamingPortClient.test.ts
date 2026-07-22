import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamingPortClient } from '../../content/interpretation/StreamingPortClient';
import type { ContentPacket } from '../../shared/contentPacket';

class ListenerChannel<T extends (...args: never[]) => void> {
  listeners = new Set<T>();
  addListener = (listener: T) => this.listeners.add(listener);
  removeListener = (listener: T) => this.listeners.delete(listener);
  emit(...args: Parameters<T>) { for (const listener of this.listeners) listener(...args); }
}

function port() {
  const onMessage = new ListenerChannel<(value: unknown) => void>();
  const onDisconnect = new ListenerChannel<() => void>();
  return {
    value: {
      disconnect: vi.fn(),
      onDisconnect,
      onMessage,
      postMessage: vi.fn(),
    } as unknown as chrome.runtime.Port,
    onDisconnect,
    onMessage,
  };
}

const packet: ContentPacket = {
  platform: 'website', title: 'Example', timestamp: '0', text: 'One', metadata: {},
};

describe('StreamingPortClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reconnects after a BFCache port disconnect', () => {
    const first = port();
    const second = port();
    const connect = vi.fn()
      .mockReturnValueOnce(first.value)
      .mockReturnValueOnce(second.value);
    vi.stubGlobal('chrome', { runtime: { connect, lastError: undefined } });

    const client = new StreamingPortClient();
    client.send(packet);
    first.onDisconnect.emit();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    client.send(packet);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(first.value.postMessage).toHaveBeenCalledOnce();
    expect(second.value.postMessage).toHaveBeenCalledOnce();
    client.close();
  });

  it('drops stale interpretation responses after a reading-context reset', () => {
    const connection = port();
    vi.stubGlobal('chrome', {
      runtime: { connect: vi.fn(() => connection.value), lastError: undefined },
    });
    const client = new StreamingPortClient();
    const received: unknown[] = [];
    client.subscribe((message) => received.push(message));
    client.send(packet);
    const oldSession = (connection.value.postMessage as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].session_id as string;
    client.reset();
    const newSession = (connection.value.postMessage as ReturnType<typeof vi.fn>)
      .mock.calls[1][0].session_id as string;
    const data = {
      summary: '', malayalam_translation: '', key_points: [], keywords: [], glossary: [],
      isl_gloss: [], confidence: 0, playback: { items: [], unsupported_tokens: [] },
    };

    connection.onMessage.emit({
      type: 'interpretation', sequence: 1, session_id: oldSession, data,
    });
    connection.onMessage.emit({
      type: 'interpretation', sequence: 3, session_id: newSession, data,
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ session_id: newSession });
    client.close();
  });
});
