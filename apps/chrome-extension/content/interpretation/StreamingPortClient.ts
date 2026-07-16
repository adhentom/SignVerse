import type { ContentPacket } from '../../shared/contentPacket';
import { isStreamServerMessage, STREAM_PORT_NAME, type StreamServerMessage } from '../../shared/streaming';

export class StreamingPortClient {
  private readonly port = chrome.runtime.connect({ name: STREAM_PORT_NAME });
  private sequence = 0;
  private sessionId = crypto.randomUUID();
  private listener?: (message: StreamServerMessage) => void;

  constructor() {
    this.port.onMessage.addListener((value: unknown) => {
      if (isStreamServerMessage(value)) this.listener?.(value);
    });
  }

  subscribe(listener: (message: StreamServerMessage) => void): void {
    this.listener = listener;
  }

  send(packet: ContentPacket): number {
    this.sequence += 1;
    this.port.postMessage({
      type: 'content', sequence: this.sequence, session_id: this.sessionId, packet,
    });
    return this.sequence;
  }

  reset(): void {
    this.sequence += 1;
    this.sessionId = crypto.randomUUID();
    this.port.postMessage({ type: 'reset', sequence: this.sequence, session_id: this.sessionId });
  }

  close(): void {
    this.listener = undefined;
    this.port.disconnect();
  }
}
