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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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
    expect(second.value.postMessage).toHaveBeenCalledTimes(2);
    expect(second.value.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sequence: 1, type: 'content' }),
    );
    expect(second.value.postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sequence: 2, type: 'content' }),
    );
    client.close();
  });

  it('replays an unacknowledged packet after the service worker port disconnects', async () => {
    vi.useFakeTimers();
    const first = port();
    const second = port();
    const connect = vi.fn()
      .mockReturnValueOnce(first.value)
      .mockReturnValueOnce(second.value);
    vi.stubGlobal('chrome', { runtime: { connect, lastError: undefined } });

    const client = new StreamingPortClient();
    client.send(packet);
    const original = (first.value.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    first.onDisconnect.emit();
    await vi.runOnlyPendingTimersAsync();

    expect(connect).toHaveBeenCalledTimes(2);
    expect(second.value.postMessage).toHaveBeenCalledOnce();
    expect(second.value.postMessage).toHaveBeenCalledWith(original);
    client.close();
  });

  it('stops reconnecting when an extension reload invalidates the runtime context', async () => {
    vi.useFakeTimers();
    const first = port();
    const connect = vi.fn()
      .mockReturnValueOnce(first.value)
      .mockImplementationOnce(() => {
        throw new Error('Extension context invalidated.');
      });
    vi.stubGlobal('chrome', { runtime: { connect, lastError: undefined } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const client = new StreamingPortClient();
    const received: unknown[] = [];
    client.subscribe((message) => received.push(message));
    first.onDisconnect.emit();
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(received).toContainEqual({
      type: 'error',
      sequence: 0,
      session_id: expect.any(String),
      code: 'extension-context-invalidated',
      message: 'The extension was updated. Refresh this page to reconnect SignVerse.',
    });
    expect(errorSpy).not.toHaveBeenCalled();
    client.close();
  });

  it('reports an already-invalidated context without installing reconnect work', async () => {
    vi.useFakeTimers();
    const connect = vi.fn(() => {
      throw new Error('Extension context invalidated.');
    });
    vi.stubGlobal('chrome', { runtime: { connect, lastError: undefined } });

    expect(() => new StreamingPortClient()).toThrow(
      'The extension was updated. Refresh this page to reconnect SignVerse.',
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connect).toHaveBeenCalledOnce();
  });

  it('recognizes Chrome invalidation errors represented as plain objects', async () => {
    vi.useFakeTimers();
    const first = port();
    const connect = vi.fn()
      .mockReturnValueOnce(first.value)
      .mockImplementationOnce(() => {
        throw { message: 'Extension context invalidated.' };
      });
    vi.stubGlobal('chrome', { runtime: { connect, lastError: undefined } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const client = new StreamingPortClient();
    first.onDisconnect.emit();
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
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
