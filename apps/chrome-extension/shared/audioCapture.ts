export const AUDIO_CAPTURE_STORAGE_KEY = 'signverseAudioCaptureTabId';

export type AudioCaptureStatus = 'idle' | 'starting' | 'listening' | 'stopped' | 'error';

export interface AudioCaptureStartMessage {
  type: 'SIGNVERSE_AUDIO_CAPTURE_START';
  target: 'background' | 'offscreen';
  streamId: string;
  tabId: number;
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
  type: 'SIGNVERSE_AUDIO_TRANSCRIPT';
  target: 'background' | 'content';
  tabId: number;
  sequence: number;
  text: string;
  language: string;
}

export type AudioCaptureMessage =
  | AudioCaptureStartMessage
  | AudioCaptureStopMessage
  | AudioCaptureStatusMessage
  | AudioTranscriptMessage;

export function isAudioCaptureMessage(value: unknown): value is AudioCaptureMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AudioCaptureMessage>;
  if (typeof candidate.type !== 'string' || typeof candidate.tabId !== 'number') return false;
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
      typeof candidate.language === 'string'
    );
  }
  return false;
}
