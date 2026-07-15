import type { ContentPacket } from './contentPacket';

export type LiveContentStatus =
  | 'loading'
  | 'not-watch-page'
  | 'no-captions'
  | 'captions-disabled'
  | 'advertisement'
  | 'playing'
  | 'paused';

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
