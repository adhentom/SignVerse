import type { ContentPacket } from '../../shared/contentPacket';
import type { AudioTranscriptMessage } from '../../shared/audioCapture';
import type { YouTubeLiveSnapshot } from '../../shared/youtube';

export const DEFAULT_CAPTION_TIMEOUT_MS = 2_500;

type LogDetails = Record<string, boolean | number | string>;

export interface YouTubeAudioFallbackOptions {
  clearTimeout?: (timer: number) => void;
  logger?: (event: string, details: LogDetails) => void;
  startCapture: () => Promise<boolean>;
  stopCapture: () => Promise<void>;
  timeoutMs?: number;
  setTimeout?: (callback: () => void, delay: number) => number;
}

function captionPacket(snapshot: YouTubeLiveSnapshot | null): ContentPacket | null {
  const packet = snapshot?.currentPacket ?? null;
  return packet && packet.metadata.transcriptionSource !== 'tab-audio' ? packet : null;
}

/**
 * Starts tab-audio transcription only after official YouTube cues remain absent.
 *
 * Official caption packets always win: observing one cancels a pending timeout,
 * stops an active fallback, and rejects any late transcription messages.
 */
export class YouTubeAudioFallback {
  private readonly clearTimer: (timer: number) => void;
  private readonly logger: (event: string, details: LogDetails) => void;
  private readonly scheduleTimer: (callback: () => void, delay: number) => number;
  private readonly timeoutMs: number;
  private captionIdentity = '';
  private captureGeneration = 0;
  private fallbackActive = false;
  private fallbackStarting = false;
  private lastTranscriptIdentity = '';
  private lastTranscriptSequence = 0;
  private timer: number | null = null;

  constructor(private readonly options: YouTubeAudioFallbackOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_CAPTION_TIMEOUT_MS;
    this.scheduleTimer = options.setTimeout ?? ((callback, delay) => window.setTimeout(callback, delay));
    this.clearTimer = options.clearTimeout ?? ((timer) => window.clearTimeout(timer));
    this.logger = options.logger ?? ((event, details) => {
      console.info(`[SignVerse] ${event}`, details);
    });
  }

  /** Observes the latest official caption state and updates fallback capture. */
  observe(snapshot: YouTubeLiveSnapshot | null): void {
    const packet = captionPacket(snapshot);
    if (packet) {
      const identity = `${packet.metadata.videoId ?? ''}:${packet.timestamp ?? ''}:${packet.text}`;
      if (identity !== this.captionIdentity) {
        this.captionIdentity = identity;
        this.logger('caption_available', {
          textLength: packet.text.length,
          videoId: String(packet.metadata.videoId ?? ''),
        });
      }
      this.cancelTimer();
      if (this.fallbackActive || this.fallbackStarting) {
        this.captureGeneration += 1;
        this.fallbackActive = false;
        this.fallbackStarting = false;
        void this.options.stopCapture();
      }
      return;
    }

    if (
      !snapshot ||
      snapshot.status === 'advertisement' ||
      snapshot.status === 'not-watch-page' ||
      snapshot.metadata.playbackState === 'paused'
    ) {
      this.cancelTimer();
      return;
    }
    if (this.timer !== null || this.fallbackActive || this.fallbackStarting) return;

    this.timer = this.scheduleTimer(() => {
      this.timer = null;
      this.fallbackStarting = true;
      const generation = ++this.captureGeneration;
      this.logger('caption_timeout', {
        timeoutMs: this.timeoutMs,
        videoId: String(snapshot.metadata.videoId ?? ''),
      });
      void this.options.startCapture()
        .then((started) => {
          if (generation !== this.captureGeneration) {
            if (started) void this.options.stopCapture();
            return;
          }
          this.fallbackStarting = false;
          this.fallbackActive = started;
          if (started) {
            this.logger('audio_fallback_started', {
              videoId: String(snapshot.metadata.videoId ?? ''),
            });
          }
        })
        .catch((error: unknown) => {
          this.fallbackStarting = false;
          this.fallbackActive = false;
          this.logger('audio_fallback_failed', {
            error: error instanceof Error ? error.message : 'Unknown capture error',
          });
        });
    }, this.timeoutMs);
  }

  /** Returns whether a transcription is new and no official caption supersedes it. */
  acceptTranscription(
    message: AudioTranscriptMessage,
    official: YouTubeLiveSnapshot | null,
  ): boolean {
    if (captionPacket(official)) return false;
    const text = message.text.replace(/\s+/gu, ' ').trim();
    const identity = `${official?.metadata.videoId ?? ''}:${text}`;
    if (
      !text ||
      (identity === this.lastTranscriptIdentity &&
        message.sequence <= this.lastTranscriptSequence + 1)
    ) return false;
    this.lastTranscriptIdentity = identity;
    this.lastTranscriptSequence = message.sequence;
    this.logger('transcription_received', {
      sequence: message.sequence,
      textLength: message.text.trim().length,
    });
    return true;
  }

  /** Clears timers and stops capture owned by the fallback. */
  dispose(): void {
    this.cancelTimer();
    if (this.fallbackActive || this.fallbackStarting) {
      this.captureGeneration += 1;
      this.fallbackActive = false;
      this.fallbackStarting = false;
      void this.options.stopCapture();
    }
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }
}

/** Parses the optional build-time fallback timeout while enforcing a safe minimum. */
export function captionTimeoutMs(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 500 ? parsed : DEFAULT_CAPTION_TIMEOUT_MS;
}
