export interface PlaybackItem {
  token_id: string;
  asset_id: string;
  duration: number;
  confidence: number;
}

export interface PlaybackSequence {
  items: PlaybackItem[];
  unsupported_tokens: string[];
}

export interface InterpretationResponse {
  summary: string;
  malayalam_translation: string;
  key_points: string[];
  keywords: string[];
  glossary: string[];
  isl_gloss: string[];
  confidence: number;
  playback?: PlaybackSequence;
}

export type InterpretationErrorCode =
  | 'configuration'
  | 'timeout'
  | 'connection-failure'
  | 'backend-unavailable'
  | 'invalid-response';

export type InterpretationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: InterpretationResponse }
  | { status: 'error'; code: InterpretationErrorCode; message: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isPlaybackItem(value: unknown): value is PlaybackItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PlaybackItem>;
  return (
    typeof candidate.token_id === 'string' &&
    typeof candidate.asset_id === 'string' &&
    typeof candidate.duration === 'number' &&
    Number.isFinite(candidate.duration) &&
    candidate.duration > 0 &&
    typeof candidate.confidence === 'number' &&
    Number.isFinite(candidate.confidence) &&
    candidate.confidence >= 0 &&
    candidate.confidence <= 1
  );
}

function isPlaybackSequence(value: unknown): value is PlaybackSequence {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PlaybackSequence>;
  return (
    Array.isArray(candidate.items) &&
    candidate.items.every(isPlaybackItem) &&
    isStringArray(candidate.unsupported_tokens)
  );
}

export function isInterpretationResponse(value: unknown): value is InterpretationResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<InterpretationResponse>;
  return (
    typeof candidate.summary === 'string' &&
    typeof candidate.malayalam_translation === 'string' &&
    isStringArray(candidate.key_points) &&
    isStringArray(candidate.keywords) &&
    isStringArray(candidate.glossary) &&
    isStringArray(candidate.isl_gloss) &&
    typeof candidate.confidence === 'number' &&
    Number.isFinite(candidate.confidence) &&
    candidate.confidence >= 0 &&
    candidate.confidence <= 1 &&
    (candidate.playback === undefined || isPlaybackSequence(candidate.playback))
  );
}
