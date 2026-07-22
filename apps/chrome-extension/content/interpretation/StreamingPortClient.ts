import type { ContentPacket } from '../../shared/contentPacket';
import { isStreamServerMessage, STREAM_PORT_NAME, type StreamServerMessage } from '../../shared/streaming';

export class StreamingPortClient {
  private port?: chrome.runtime.Port;
  private closed = false;
  private sequence = 0;
  private sessionId = crypto.randomUUID();
  private listener?: (message: StreamServerMessage) => void;

  constructor() {
    this.connect();
    window.addEventListener('pageshow', this.handlePageShow);
  }

  private readonly handleMessage = (value: unknown) => {
    if (!isStreamServerMessage(value)) return;
    if (value.type !== 'status' && value.session_id !== this.sessionId) {
      console.debug('[SignVerse] stale_stream_response_ignored', {
        type: value.type,
        sequence: value.sequence,
      });
      return;
    }
    this.listener?.(value);
  };

  private readonly handleDisconnect = () => {
    if (typeof chrome !== 'undefined') void chrome.runtime.lastError?.message;
    this.port = undefined;
  };

  private readonly handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted) this.connect();
  };

  private connect(): chrome.runtime.Port | undefined {
    if (this.closed) return undefined;
    if (this.port) return this.port;
    try {
      const port = chrome.runtime.connect({ name: STREAM_PORT_NAME });
      port.onMessage.addListener(this.handleMessage);
      port.onDisconnect.addListener(this.handleDisconnect);
      this.port = port;
      return port;
    } catch {
      return undefined;
    }
  }

  private post(value: unknown): void {
    const port = this.connect();
    if (!port) return;
    try {
      port.postMessage(value);
    } catch {
      this.port = undefined;
      try {
        this.connect()?.postMessage(value);
      } catch {
        this.port = undefined;
      }
    }
  }

  subscribe(listener: (message: StreamServerMessage) => void): void {
    this.listener = listener;
  }

  send(packet: ContentPacket): number {
    this.sequence += 1;
    this.post({
      type: 'content', sequence: this.sequence, session_id: this.sessionId, packet,
    });
    return this.sequence;
  }

  reset(): void {
    this.sequence += 1;
    this.sessionId = crypto.randomUUID();
    console.info('[SignVerse] streaming_context_reset', { sequence: this.sequence });
    this.post({ type: 'reset', sequence: this.sequence, session_id: this.sessionId });
  }

  close(): void {
    this.listener = undefined;
    this.closed = true;
    window.removeEventListener('pageshow', this.handlePageShow);
    this.port?.onMessage.removeListener(this.handleMessage);
    this.port?.onDisconnect.removeListener(this.handleDisconnect);
    this.port?.disconnect();
    this.port = undefined;
  }
}
