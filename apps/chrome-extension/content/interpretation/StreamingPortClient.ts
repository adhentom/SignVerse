import type { ContentPacket } from '../../shared/contentPacket';
import {
  isStreamServerMessage,
  STREAM_PORT_NAME,
  type StreamClientMessage,
  type StreamServerMessage,
} from '../../shared/streaming';
import {
  runtimeDiagnostic,
  streamCorrelationId,
} from '../../shared/runtimeDiagnostics';

export class StreamingPortClient {
  private port?: chrome.runtime.Port;
  private closed = false;
  private sequence = 0;
  private sessionId = crypto.randomUUID();
  private listener?: (message: StreamServerMessage) => void;
  private readonly pending = new Map<number, StreamClientMessage>();
  private reconnectAttempt = 0;
  private reconnectTimer: number | undefined;

  constructor() {
    this.connect();
    window.addEventListener('pageshow', this.handlePageShow);
  }

  private readonly handleMessage = (value: unknown) => {
    if (!isStreamServerMessage(value)) return;
    if (value.type === 'status') {
      if (value.status === 'connected') {
        this.reconnectAttempt = 0;
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }
    } else if (
      value.type === 'interpretation' ||
      value.type === 'error' ||
      value.type === 'reset'
    ) {
      this.pending.delete(value.sequence);
    }
    if (
      value.type !== 'status' &&
      value.session_id !== this.sessionId &&
      !(value.type === 'error' && value.session_id === 'unknown')
    ) {
      runtimeDiagnostic('stale_stream_response_ignored', {
        type: value.type,
        sequence: value.sequence,
        correlationId: streamCorrelationId(value.session_id, value.sequence),
      }, 'debug');
      return;
    }
    if (value.type === 'interpretation') {
      runtimeDiagnostic('content_stream_packet_received', {
        correlationId: streamCorrelationId(value.session_id, value.sequence),
        sequence: value.sequence,
        glossCount: value.data.isl_gloss.length,
        playbackCount: value.data.playback?.items.length ?? 0,
      });
    } else if (value.type === 'error') {
      runtimeDiagnostic('content_stream_error_received', {
        correlationId: streamCorrelationId(value.session_id, value.sequence),
        sequence: value.sequence,
        code: value.code,
        message: value.message,
      }, 'warn');
    }
    this.listener?.(value);
  };

  private readonly handleDisconnect = () => {
    if (typeof chrome !== 'undefined') void chrome.runtime.lastError?.message;
    this.port = undefined;
    if (this.closed) return;
    runtimeDiagnostic('content_stream_port_disconnected', {
      sessionId: this.sessionId,
      reason: 'service-worker-port-closed',
      pending: this.pending.size,
    }, 'warn');
    this.listener?.({ type: 'status', status: 'reconnecting' });
    this.scheduleReconnect();
  };

  private readonly handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted) this.reconnectAndReplay();
  };

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== undefined) return;
    const delayMs = Math.min(100 * 2 ** this.reconnectAttempt, 2_000);
    this.reconnectAttempt += 1;
    runtimeDiagnostic('content_stream_reconnect_scheduled', {
      attempt: this.reconnectAttempt,
      delayMs,
      pending: this.pending.size,
    }, 'warn');
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnectAndReplay();
    }, delayMs);
  }

  private reconnectAndReplay(): void {
    if (this.closed) return;
    const port = this.connect();
    if (!port) {
      this.scheduleReconnect();
      return;
    }
    this.replayPending(port);
  }

  private replayPending(port: chrome.runtime.Port): void {
    for (const message of this.pending.values()) {
      try {
        port.postMessage(message);
        runtimeDiagnostic('content_stream_pending_replayed', {
          correlationId: streamCorrelationId(message.session_id, message.sequence),
          sequence: message.sequence,
          pending: this.pending.size,
        }, 'warn');
      } catch (error) {
        this.port = undefined;
        runtimeDiagnostic('content_stream_replay_failed', {
          correlationId: streamCorrelationId(message.session_id, message.sequence),
          message: error instanceof Error ? error.message : String(error),
          sequence: message.sequence,
        }, 'error');
        this.scheduleReconnect();
        return;
      }
    }
  }

  private connect(): chrome.runtime.Port | undefined {
    if (this.closed) return undefined;
    if (this.port) return this.port;
    try {
      const port = chrome.runtime.connect({ name: STREAM_PORT_NAME });
      port.onMessage.addListener(this.handleMessage);
      port.onDisconnect.addListener(this.handleDisconnect);
      this.port = port;
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
      runtimeDiagnostic('content_stream_port_connected', {
        sessionId: this.sessionId,
      });
      return port;
    } catch (error) {
      runtimeDiagnostic('content_stream_port_connect_failed', {
        sessionId: this.sessionId,
        message: error instanceof Error ? error.message : String(error),
      }, 'error');
      return undefined;
    }
  }

  private post(value: unknown): boolean {
    const hadPort = Boolean(this.port);
    const port = this.connect();
    if (!port) return false;
    if (!hadPort && this.pending.size > 0) this.replayPending(port);
    if (this.port !== port) return false;
    try {
      port.postMessage(value);
      return true;
    } catch (error) {
      this.port = undefined;
      try {
        this.connect()?.postMessage(value);
        return Boolean(this.port);
      } catch (retryError) {
        this.port = undefined;
        runtimeDiagnostic('content_stream_message_dropped', {
          message: retryError instanceof Error
            ? retryError.message
            : error instanceof Error
              ? error.message
              : String(retryError),
        }, 'error');
        return false;
      }
    }
  }

  subscribe(listener: (message: StreamServerMessage) => void): void {
    this.listener = listener;
  }

  correlationId(sequence: number): string {
    return streamCorrelationId(this.sessionId, sequence);
  }

  send(packet: ContentPacket): number | undefined {
    this.sequence += 1;
    const correlationId = streamCorrelationId(this.sessionId, this.sequence);
    runtimeDiagnostic('content_packet_created', {
      correlationId,
      sequence: this.sequence,
      platform: packet.platform,
      textLength: packet.text.length,
    });
    const tracedPacket: ContentPacket = {
      ...packet,
      metadata: {
        ...packet.metadata,
        _signverse_correlation_id: correlationId,
      },
    };
    const message: StreamClientMessage = {
      type: 'content',
      sequence: this.sequence,
      session_id: this.sessionId,
      packet: tracedPacket,
    };
    const posted = this.post(message);
    if (!posted) {
      runtimeDiagnostic('content_packet_not_sent', {
        correlationId,
        sequence: this.sequence,
        reason: 'runtime-port-unavailable',
      }, 'error');
      return undefined;
    }
    this.pending.set(this.sequence, message);
    runtimeDiagnostic('content_packet_sent_to_background', {
      correlationId,
      sequence: this.sequence,
      platform: packet.platform,
    });
    return this.sequence;
  }

  reset(): void {
    this.pending.clear();
    this.sequence += 1;
    this.sessionId = crypto.randomUUID();
    runtimeDiagnostic('streaming_context_reset', {
      correlationId: streamCorrelationId(this.sessionId, this.sequence),
      sequence: this.sequence,
    });
    if (!this.post({ type: 'reset', sequence: this.sequence, session_id: this.sessionId })) {
      runtimeDiagnostic('streaming_context_reset_not_sent', {
        correlationId: streamCorrelationId(this.sessionId, this.sequence),
        sequence: this.sequence,
      }, 'warn');
    }
  }

  close(): void {
    this.listener = undefined;
    this.closed = true;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.pending.clear();
    window.removeEventListener('pageshow', this.handlePageShow);
    this.port?.onMessage.removeListener(this.handleMessage);
    this.port?.onDisconnect.removeListener(this.handleDisconnect);
    this.port?.disconnect();
    this.port = undefined;
  }
}
