import { isContentPacket, type ContentPacket } from './contentPacket';
import { isInterpretationResponse, type InterpretationResponse } from './interpretation';

export const STREAM_PORT_NAME = 'SIGNVERSE_INTERPRETATION_STREAM';

export interface StreamContentMessage {
  type: 'content';
  sequence: number;
  session_id: string;
  packet: ContentPacket;
}

export interface StreamResetMessage {
  type: 'reset';
  sequence: number;
  session_id: string;
}

export type StreamClientMessage = StreamContentMessage | StreamResetMessage;
export type StreamServerMessage =
  | { type: 'interpretation'; sequence: number; session_id: string; data: InterpretationResponse }
  | { type: 'reset'; sequence: number; session_id: string }
  | { type: 'status'; status: 'connecting' | 'connected' | 'reconnecting' }
  | { type: 'error'; sequence: number; session_id: string; code: string; message: string };

export function isStreamClientMessage(value: unknown): value is StreamClientMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StreamClientMessage>;
  if (!Number.isInteger(candidate.sequence) || typeof candidate.session_id !== 'string') return false;
  if (candidate.type === 'reset') return true;
  return candidate.type === 'content' && isContentPacket(candidate.packet);
}

export function isStreamServerMessage(value: unknown): value is StreamServerMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'status') {
    return ['connecting', 'connected', 'reconnecting'].includes(String(candidate.status));
  }
  if (!Number.isInteger(candidate.sequence) || typeof candidate.session_id !== 'string') return false;
  if (candidate.type === 'reset') return true;
  if (candidate.type === 'interpretation') return isInterpretationResponse(candidate.data);
  return candidate.type === 'error' && typeof candidate.code === 'string' && typeof candidate.message === 'string';
}
