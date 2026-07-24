import type { LiveContentSnapshot } from './liveContent';

export type YouTubePlaybackState = 'playing' | 'paused' | 'seeking' | 'advertisement';

export interface YouTubePacketMetadata {
  [key: string]: unknown;
  captionEndMs?: number;
  captionSource?: 'tab-audio' | 'youtube-dom' | 'youtube-track';
  captionStartMs?: number;
  channel: string;
  cueId?: string;
  language: string;
  playbackTimeMs?: number;
  videoId: string;
  captionsEnabled: boolean;
  isAdvertisement: boolean;
  isLive: boolean;
  playbackState: YouTubePlaybackState;
}

export type YouTubeLiveSnapshot = LiveContentSnapshot<YouTubePacketMetadata>;
