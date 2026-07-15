import type { PlaybackItem } from '../shared/interpretation';

export type RendererState = 'Idle' | 'Loading' | 'Playing' | 'Paused' | 'Finished' | 'Error';
export type AssetFormat = 'lottie' | 'svg-sequence' | 'glb';

export interface SignAsset {
  asset_id: string;
  token_id: string;
  display_name: string;
  format: AssetFormat;
  source: string;
  duration: number;
  license: string;
  version: string;
  review_status: 'draft' | 'approved';
}

export interface LoadedAsset {
  metadata: SignAsset;
  data: unknown;
}

export interface Renderer {
  readonly format: AssetFormat;
  mount(target: HTMLElement, asset: LoadedAsset, reducedMotion: boolean): Promise<void>;
  play(speed: number): void;
  pause(): void;
  seek(progress: number): void;
  destroy(): void;
}

export interface PlaybackSnapshot {
  state: RendererState;
  elapsed: number;
  currentIndex: number;
  speed: number;
  error?: string;
}

export interface ScheduledSign {
  item: PlaybackItem;
  index: number;
  start: number;
  end: number;
  localElapsed: number;
  localProgress: number;
}
