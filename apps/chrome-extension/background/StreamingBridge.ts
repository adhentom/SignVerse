import type { BackendConfig } from '../config/backendConfig';
import { isStreamClientMessage, isStreamServerMessage, type StreamClientMessage } from '../shared/streaming';

const MAX_RECONNECT_MS = 5_000;

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
    this.port.onDisconnect.addListener(this.close);
    this.connect();
  }

  private readonly handlePortMessage = (value: unknown) => {
    if (!isStreamClientMessage(value)) return;
    if (value.type === 'reset') {
      this.pending.clear();
      this.sent.clear();
    }
    this.pending.set(value.sequence, value);
    this.flush();
  };

  private connect(): void {
    if (this.closed) return;
    if (!this.config.baseUrl) {
      this.port.postMessage({
        type: 'error', sequence: 0, session_id: 'unknown', code: 'configuration',
        message: 'The SignVerse backend URL is not configured.',
      });
      return;
    }
    this.port.postMessage({
      type: 'status', status: this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
    });
    const url = `${this.config.baseUrl.replace(/^http/u, 'ws')}/stream`;
    const socket = this.createSocket(url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.port.postMessage({ type: 'status', status: 'connected' });
      this.flush();
    });
    socket.addEventListener('message', (event) => {
      let value: unknown;
      try { value = JSON.parse(String(event.data)); } catch { return; }
      if (!isStreamServerMessage(value)) return;
      if ('sequence' in value && (value.type === 'interpretation' || value.type === 'reset')) {
        this.pending.delete(value.sequence);
        this.sent.delete(value.sequence);
      }
      this.port.postMessage(value);
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
    this.socket?.close();
    this.socket = undefined;
    this.pending.clear();
    this.sent.clear();
  };
}
