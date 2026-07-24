export interface NonManualMarker {
  marker: 'brow-raise' | 'brow-lower' | 'head-shake' | 'head-nod' | 'head-tilt'
    | 'eye-gaze' | 'mouth-gesture' | 'body-shift' | 'facial-emotion';
  value: string;
  scope: 'token' | 'phrase';
  timing: 'before' | 'throughout' | 'after';
  intensity: number;
}

export interface PlaybackItem {
  token_id: string;
  asset_id: string;
  duration: number;
  confidence: number;
  priority?: number;
  phrase_id?: string;
  source_gloss?: string;
  transition_ms?: number;
  non_manual_markers?: NonManualMarker[];
  animation_ready?: boolean;
  synchronization?: PlaybackSynchronization;
}

export interface PlaybackSynchronization {
  caption_end_ms: number;
  caption_start_ms: number;
  cue_id: string;
  request_sequence: number;
  source_text: string;
}

export interface ISLGlossUnit {
  gloss: string;
  role: string;
  referent: string;
  classifier: string;
  emphasis: number;
  non_manual_markers: NonManualMarker[];
  confidence: number;
}

export interface ISLPhraseSegment {
  segment_id: string;
  meaning: string;
  discourse_function: string;
  glosses: ISLGlossUnit[];
  confidence: number;
}

export interface InterpretationQuality {
  semantic_accuracy: number;
  malayalam_translation: number;
  gloss_correctness: number;
  asset_matching?: number;
  animation_readiness?: number;
  avatar_confidence?: number;
}

export interface InterpretationDiagnostics {
  source_text: string;
  semantic_representation: Record<string, unknown>;
  phrase_segments: ISLPhraseSegment[];
  matched_assets: string[];
  missing_glosses: string[];
  playback_timeline: Array<Record<string, unknown>>;
}

export interface PlaybackSequence {
  items: PlaybackItem[];
  unsupported_tokens: string[];
  missing?: PlaybackMiss[];
}

export interface PlaybackMiss {
  token: string;
  normalized_token: string;
  reason: 'unknown-gloss' | 'lexicon-token-without-asset' | 'asset-unavailable';
  detail: string;
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
  isl_segments?: ISLPhraseSegment[];
  quality?: InterpretationQuality;
  diagnostics?: InterpretationDiagnostics;
}

export type InterpretationErrorCode =
  | 'extension-context-invalidated'
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
    && (candidate.priority === undefined || (Number.isInteger(candidate.priority) && candidate.priority >= -100 && candidate.priority <= 100))
    && (candidate.transition_ms === undefined || (
      Number.isInteger(candidate.transition_ms) && candidate.transition_ms >= 0 && candidate.transition_ms <= 1_000
    ))
    && (candidate.animation_ready === undefined || typeof candidate.animation_ready === 'boolean')
    && (candidate.non_manual_markers === undefined || (
      Array.isArray(candidate.non_manual_markers) && candidate.non_manual_markers.every(isNonManualMarker)
    ))
  );
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonManualMarker(value: unknown): value is NonManualMarker {
  if (!value || typeof value !== 'object') return false;
  const marker = value as Partial<NonManualMarker>;
  return typeof marker.marker === 'string'
    && typeof marker.value === 'string'
    && ['token', 'phrase'].includes(marker.scope ?? '')
    && ['before', 'throughout', 'after'].includes(marker.timing ?? '')
    && isUnitInterval(marker.intensity);
}

function isISLPhraseSegment(value: unknown): value is ISLPhraseSegment {
  if (!value || typeof value !== 'object') return false;
  const segment = value as Partial<ISLPhraseSegment>;
  return typeof segment.segment_id === 'string'
    && typeof segment.meaning === 'string'
    && typeof segment.discourse_function === 'string'
    && isUnitInterval(segment.confidence)
    && Array.isArray(segment.glosses)
    && segment.glosses.every((unit) => (
      Boolean(unit) && typeof unit === 'object'
      && typeof unit.gloss === 'string'
      && typeof unit.role === 'string'
      && typeof unit.referent === 'string'
      && typeof unit.classifier === 'string'
      && isUnitInterval(unit.emphasis)
      && isUnitInterval(unit.confidence)
      && Array.isArray(unit.non_manual_markers)
      && unit.non_manual_markers.every(isNonManualMarker)
    ));
}

function isInterpretationQuality(value: unknown): value is InterpretationQuality {
  if (!value || typeof value !== 'object') return false;
  const quality = value as Partial<InterpretationQuality>;
  return isUnitInterval(quality.semantic_accuracy)
    && isUnitInterval(quality.malayalam_translation)
    && isUnitInterval(quality.gloss_correctness)
    && (quality.asset_matching === undefined || isUnitInterval(quality.asset_matching))
    && (quality.animation_readiness === undefined || isUnitInterval(quality.animation_readiness))
    && (quality.avatar_confidence === undefined || isUnitInterval(quality.avatar_confidence));
}

function isPlaybackSequence(value: unknown): value is PlaybackSequence {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PlaybackSequence>;
  return (
    Array.isArray(candidate.items) &&
    candidate.items.every(isPlaybackItem) &&
    isStringArray(candidate.unsupported_tokens) &&
    (candidate.missing === undefined || (
      Array.isArray(candidate.missing) && candidate.missing.every((miss) => {
        if (!miss || typeof miss !== 'object') return false;
        const item = miss as Partial<PlaybackMiss>;
        return typeof item.token === 'string'
          && typeof item.normalized_token === 'string'
          && ['unknown-gloss', 'lexicon-token-without-asset', 'asset-unavailable'].includes(item.reason ?? '')
          && typeof item.detail === 'string';
      })
    ))
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
    (candidate.playback === undefined || isPlaybackSequence(candidate.playback)) &&
    (candidate.isl_segments === undefined || (
      Array.isArray(candidate.isl_segments) && candidate.isl_segments.every(isISLPhraseSegment)
    )) &&
    (candidate.quality === undefined || isInterpretationQuality(candidate.quality)) &&
    (candidate.diagnostics === undefined || (
      Boolean(candidate.diagnostics) && typeof candidate.diagnostics === 'object'
    ))
  );
}
