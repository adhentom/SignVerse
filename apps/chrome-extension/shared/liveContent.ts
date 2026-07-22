import type { ContentPacket } from './contentPacket';

export type LiveContentStatus =
  | 'loading'
  | 'not-watch-page'
  | 'no-captions'
  | 'captions-disabled'
  | 'advertisement'
  | 'playing'
  | 'paused'
  | 'not-in-session'
  | 'connected'
  | 'interrupted'
  | 'reconnecting';

export interface LiveContentSnapshot<TMetadata extends object = Record<string, unknown>> {
  status: LiveContentStatus;
  statusMessage: string;
  title: string;
  timestamp: string;
  metadata: TMetadata;
  currentPacket: ContentPacket<TMetadata> | null;
  history: ContentPacket<TMetadata>[];
}

export interface LiveContentSession<TMetadata extends object = Record<string, unknown>> {
  start(listener: (snapshot: LiveContentSnapshot<TMetadata>) => void): () => void;
}

export function resolveLiveSourceText(
  snapshot: LiveContentSnapshot<object> | null,
): string {
  return snapshot?.currentPacket?.text ?? snapshot?.history.at(-1)?.text ?? '';
}
