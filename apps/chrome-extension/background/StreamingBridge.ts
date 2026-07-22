import type { BackendConfig } from '../config/backendConfig';
import { isStreamClientMessage, isStreamServerMessage, type StreamClientMessage } from '../shared/streaming';

const MAX_RECONNECT_MS = 5_000;
export const MAX_PENDING_STREAM_MESSAGES = 256;

export class StreamingBridge {
  private socket?: WebSocket;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private closed = false;
  private readonly pending = new Map<number, StreamClientMessage>();
  private readonly sent = new Set<number>();

  constructor(
    private readonly config: BackendConfig,
    private readonly port: chrome.runtime.Port,
    private readonly createSocket: (url: string) => WebSocket = (url) => new WebSocket(url),
  ) {}

  start(): void {
    this.port.onMessage.addListener(this.handlePortMessage);
    this.port.onDisconnect.addListener(this.handlePortDisconnect);
    this.connect();
  }

  private readonly handlePortDisconnect = () => {
    // Chrome reports expected BFCache/navigation port closure through lastError.
    // Reading it prevents an "Unchecked runtime.lastError" extension warning.
    if (typeof chrome !== 'undefined') void chrome.runtime.lastError?.message;
    this.close();
  };

  private postToPort(value: unknown): boolean {
    if (this.closed) return false;
    try {
      this.port.postMessage(value);
      return true;
    } catch {
      this.close();
      return false;
    }
  }

  private readonly handlePortMessage = (value: unknown) => {
    if (!isStreamClientMessage(value)) return;
    if (value.type === 'reset') {
      this.pending.clear();
      this.sent.clear();
    }
    if (value.type === 'content' && this.pending.size >= MAX_PENDING_STREAM_MESSAGES) {
      const oldestSequence = this.pending.keys().next().value as number | undefined;
      if (oldestSequence !== undefined) {
        const dropped = this.pending.get(oldestSequence);
        this.pending.delete(oldestSequence);
        this.sent.delete(oldestSequence);
        this.postToPort({
          type: 'error',
          sequence: oldestSequence,
          session_id: dropped?.session_id ?? value.session_id,
          code: 'stream-backpressure',
          message: 'An older interpretation packet was dropped while the backend was unavailable.',
        });
      }
    }
    this.pending.set(value.sequence, value);
    console.info('[SignVerse] stream_bridge_message_queued', {
      type: value.type,
      sequence: value.sequence,
      pending: this.pending.size,
    });
    this.flush();
  };

  private connect(): void {
    if (this.closed) return;
    if (!this.config.baseUrl) {
      this.postToPort({
        type: 'error', sequence: 0, session_id: 'unknown', code: 'configuration',
        message: 'The SignVerse backend URL is not configured.',
      });
      return;
    }
    this.postToPort({
      type: 'status', status: this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
    });
    const url = `${this.config.baseUrl.replace(/^http/u, 'ws')}/stream`;
    const socket = this.createSocket(url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.postToPort({ type: 'status', status: 'connected' });
      this.flush();
    });
    socket.addEventListener('message', (event) => {
      let value: unknown;
      try { value = JSON.parse(String(event.data)); } catch { return; }
      if (!isStreamServerMessage(value)) return;
      if (value.type === 'interpretation') {
        console.info('[SignVerse] stream_bridge_interpretation_received', {
          sequence: value.sequence,
          playbackCount: value.data.playback?.items.length ?? 0,
        });
      }
      if ('sequence' in value && (value.type === 'interpretation' || value.type === 'reset')) {
        this.pending.delete(value.sequence);
        this.sent.delete(value.sequence);
      }
      this.postToPort(value);
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket || this.closed) return;
      this.socket = undefined;
      this.sent.clear();
      this.scheduleReconnect();
    });
    socket.addEventListener('error', () => socket.close());
  }

  private flush(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    for (const message of this.pending.values()) {
      if (this.sent.has(message.sequence)) continue;
      this.socket.send(JSON.stringify(message));
      this.sent.add(message.sequence);
    }
  }

  private scheduleReconnect(): void {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(250 * 2 ** this.reconnectAttempt, MAX_RECONNECT_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  readonly close = () => {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    this.port.onMessage.removeListener(this.handlePortMessage);
    this.port.onDisconnect.removeListener(this.handlePortDisconnect);
    this.socket?.close();
    this.socket = undefined;
    this.pending.clear();
    this.sent.clear();
  };
}
