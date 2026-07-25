export const AUDIO_CAPTURE_STORAGE_KEY = 'signverseAudioCaptureTabId';

export type AudioCaptureStatus = 'idle' | 'starting' | 'listening' | 'stopped' | 'error';

export interface AudioCaptureStartMessage {
  type: 'SIGNVERSE_AUDIO_CAPTURE_START';
  target: 'background' | 'offscreen';
  streamId: string;
  tabId: number;
}

export interface AudioFallbackStartMessage {
  type: 'SIGNVERSE_AUDIO_FALLBACK_START';
  target: 'background';
  tabId?: number;
}

export interface AudioFallbackStopMessage {
  type: 'SIGNVERSE_AUDIO_FALLBACK_STOP';
  target: 'background';
  tabId?: number;
}

export interface AudioCaptureStopMessage {
  type: 'SIGNVERSE_AUDIO_CAPTURE_STOP';
  target: 'background' | 'offscreen';
  tabId: number;
}

export interface AudioCaptureStatusMessage {
  type: 'SIGNVERSE_AUDIO_CAPTURE_STATUS';
  target: 'background' | 'content';
  tabId: number;
  status: AudioCaptureStatus;
  message: string;
}

export interface AudioTranscriptMessage {
  durationMs?: number;
  type: 'SIGNVERSE_AUDIO_TRANSCRIPT';
  target: 'background' | 'content';
  tabId: number;
  sequence: number;
  text: string;
  language: string;
}

export type AudioCaptureMessage =
  | AudioCaptureStartMessage
  | AudioFallbackStartMessage
  | AudioFallbackStopMessage
  | AudioCaptureStopMessage
  | AudioCaptureStatusMessage
  | AudioTranscriptMessage;

export function isAudioCaptureMessage(value: unknown): value is AudioCaptureMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AudioCaptureMessage>;
  if (typeof candidate.type !== 'string') return false;
  if (
    candidate.type === 'SIGNVERSE_AUDIO_FALLBACK_START' ||
    candidate.type === 'SIGNVERSE_AUDIO_FALLBACK_STOP'
  ) {
    return (
      candidate.target === 'background' &&
      (candidate.tabId === undefined ||
        (typeof candidate.tabId === 'number' && Number.isInteger(candidate.tabId)))
    );
  }
  if (!('tabId' in candidate) || typeof candidate.tabId !== 'number') return false;
  if (candidate.type === 'SIGNVERSE_AUDIO_CAPTURE_START') {
    return typeof candidate.streamId === 'string' && ['background', 'offscreen'].includes(candidate.target ?? '');
  }
  if (candidate.type === 'SIGNVERSE_AUDIO_CAPTURE_STOP') {
    return ['background', 'offscreen'].includes(candidate.target ?? '');
  }
  if (candidate.type === 'SIGNVERSE_AUDIO_CAPTURE_STATUS') {
    return (
      ['background', 'content'].includes(candidate.target ?? '') &&
      typeof candidate.status === 'string' &&
      typeof candidate.message === 'string'
    );
  }
  if (candidate.type === 'SIGNVERSE_AUDIO_TRANSCRIPT') {
    return (
      ['background', 'content'].includes(candidate.target ?? '') &&
      typeof candidate.sequence === 'number' &&
      typeof candidate.text === 'string' &&
      typeof candidate.language === 'string' &&
      (candidate.durationMs === undefined ||
        (typeof candidate.durationMs === 'number' &&
          Number.isFinite(candidate.durationMs) &&
          candidate.durationMs >= 0))
    );
  }
  return false;
}
