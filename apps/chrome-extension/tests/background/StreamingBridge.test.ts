import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PENDING_STREAM_MESSAGES, StreamingBridge } from '../../background/StreamingBridge';

class ListenerChannel<T extends (...args: never[]) => void> {
  listeners = new Set<T>();
  addListener = (listener: T) => this.listeners.add(listener);
  removeListener = (listener: T) => this.listeners.delete(listener);
  emit(...args: Parameters<T>) { this.listeners.forEach((listener) => listener(...args)); }
}

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  send(value: string) { this.sent.push(value); }
  close() { this.emit('close'); }
  emit(type: string, data = '') {
    if (type === 'open') this.readyState = 1;
    this.listeners.get(type)?.forEach((listener) => listener({ data } as MessageEvent));
  }
}

describe('StreamingBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', { OPEN: 1 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps ordered packets pending and replays only unacknowledged packets after reconnect', () => {
    const onMessage = new ListenerChannel<(value: unknown) => void>();
    const onDisconnect = new ListenerChannel<() => void>();
    const postMessage = vi.fn();
    const port = { name: 'stream', onMessage, onDisconnect, postMessage } as unknown as chrome.runtime.Port;
    const sockets: FakeSocket[] = [];
    const bridge = new StreamingBridge(
      { baseUrl: 'https://api.signverse.test', timeoutMs: 1_000 },
      port,
      (url) => {
        expect(url).toBe('wss://api.signverse.test/stream');
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    );
    bridge.start();
    sockets[0].emit('open');

    const packet = { platform: 'youtube', title: 'Demo', timestamp: '00:01', text: 'Hello.', metadata: {} };
    onMessage.emit({ type: 'content', sequence: 1, session_id: 'session', packet });
    onMessage.emit({ type: 'content', sequence: 2, session_id: 'session', packet: { ...packet, text: 'Next.' } });
    expect(sockets[0].sent).toHaveLength(2);

    sockets[0].emit('message', JSON.stringify({
      type: 'interpretation', sequence: 1, session_id: 'session',
      data: { summary: '', malayalam_translation: '', key_points: [], keywords: [], glossary: [], isl_gloss: [], confidence: 0 },
    }));
    sockets[0].emit('close');
    vi.advanceTimersByTime(250);
    sockets[1].emit('open');
    expect(sockets[1].sent).toHaveLength(1);
    expect(JSON.parse(sockets[1].sent[0]).sequence).toBe(2);

    onDisconnect.emit();
  });

  it('bounds disconnected packets and reports backpressure instead of growing forever', () => {
    const onMessage = new ListenerChannel<(value: unknown) => void>();
    const onDisconnect = new ListenerChannel<() => void>();
    const postMessage = vi.fn();
    const port = { name: 'stream', onMessage, onDisconnect, postMessage } as unknown as chrome.runtime.Port;
    const sockets: FakeSocket[] = [];
    const bridge = new StreamingBridge(
      { baseUrl: 'https://api.signverse.test', timeoutMs: 1_000 },
      port,
      () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    );
    bridge.start();
    const packet = { platform: 'youtube', title: 'Demo', timestamp: '00:01', text: 'Hello.', metadata: {} };
    for (let sequence = 1; sequence <= MAX_PENDING_STREAM_MESSAGES + 10; sequence += 1) {
      onMessage.emit({ type: 'content', sequence, session_id: 'session', packet });
    }

    expect(postMessage.mock.calls.filter(([message]) => message.code === 'stream-backpressure'))
      .toHaveLength(10);
    sockets[0].emit('open');
    expect(sockets[0].sent).toHaveLength(MAX_PENDING_STREAM_MESSAGES);
    expect(JSON.parse(sockets[0].sent[0]).sequence).toBe(11);
    onDisconnect.emit();
  });
});
