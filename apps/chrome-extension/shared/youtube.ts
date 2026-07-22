import type { LiveContentSnapshot } from './liveContent';

export type YouTubePlaybackState = 'playing' | 'paused' | 'seeking' | 'advertisement';

export interface YouTubePacketMetadata {
  [key: string]: unknown;
  channel: string;
  language: string;
  videoId: string;
  captionsEnabled: boolean;
  isAdvertisement: boolean;
  isLive: boolean;
  playbackState: YouTubePlaybackState;
}

export type YouTubeLiveSnapshot = LiveContentSnapshot<YouTubePacketMetadata>;
