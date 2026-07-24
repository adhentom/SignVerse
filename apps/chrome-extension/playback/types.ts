import type { PlaybackItem } from '../shared/interpretation';
import type { MotionQualityDiagnostics } from './avatar/motion/types';

export type RendererState = 'Idle' | 'Loading' | 'Playing' | 'Paused' | 'Finished' | 'Error';
export type AssetFormat = 'lottie' | 'svg-sequence' | 'mp4' | 'glb' | 'vrm';

export interface NativeISLReview {
  status: 'pending' | 'approved' | 'rejected';
  reviewer: string;
  reviewed_at: string;
  notes: string;
}

export interface SignAsset {
  asset_id: string;
  token_id: string;
  canonical_gloss: string;
  word: string;
  synonyms: string[];
  aliases?: string[];
  alternate_spellings?: string[];
  language: 'ISL';
  category: string;
  display_name: string;
  format: AssetFormat;
  file_path: string;
  source: string;
  duration: number;
  license: string;
  version: string;
  review_status: 'draft' | 'approved';
  native_review?: NativeISLReview;
  transition: 'cut' | 'cross-fade' | 'reviewed';
  handshape: string;
  orientation: string;
  facial_expression: string;
  fallback: 'fingerspell' | 'neutral-explanation' | 'sign-unavailable';
  metadata: Record<string, string | number | boolean>;
}

export interface LoadedAsset {
  metadata: SignAsset;
  data: unknown;
}

export type AvatarPoseSnapshot = Record<string, {
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
  x?: number;
  y?: number;
}>;

export interface Renderer {
  readonly format: AssetFormat;
  mount(target: HTMLElement, asset: LoadedAsset, reducedMotion: boolean): Promise<void>;
  play(speed: number): void;
  pause(): void;
  seek(progress: number): void;
  destroy(): void;
  setPlaybackContext?(item: PlaybackItem): void;
  setTransitionSource?(pose: AvatarPoseSnapshot): void;
  capturePose?(): AvatarPoseSnapshot;
  getRenderingDiagnostics?(): RenderingDiagnostics;
}

export interface RenderingDiagnostics {
  fps: number;
  frameTimeMs: number;
  animationQueueDepth: number;
  blendDurationMs: number;
  activeAnimation: string;
  droppedRenderFrames: number;
  motion?: MotionQualityDiagnostics;
  health?: RenderingHealthDiagnostics;
}

export interface RenderingHealthDiagnostics {
  averageFps: number;
  frameTimeDistributionMs: {
    p50: number;
    p95: number;
    p99: number;
    maximum: number;
  };
  droppedFramePercentage: number;
  memoryUsageEstimateBytes: number;
  memoryEstimateSource: 'performance-api' | 'asset-cache-estimate' | 'unavailable';
  cacheHitRatio: number;
  assetLoadLatencyMs: number;
  renderLoopUptimeMs: number;
  intentionallySkippedFrames: number;
  recoveryAttempts: number;
  fatalErrorCount: number;
  resourceMode: 'standard' | 'reduced';
  browserFamily: 'chrome' | 'edge' | 'brave' | 'chromium' | 'unknown';
  frameScheduler: 'animation-frame' | 'timer-fallback';
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
