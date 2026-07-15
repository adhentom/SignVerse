export interface InterpretationResponse {
  summary: string;
  key_points: string[];
  keywords: string[];
  glossary: string[];
  isl_gloss: string[];
  confidence: number;
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

export function isInterpretationResponse(value: unknown): value is InterpretationResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<InterpretationResponse>;
  return (
    typeof candidate.summary === 'string' &&
    isStringArray(candidate.key_points) &&
    isStringArray(candidate.keywords) &&
    isStringArray(candidate.glossary) &&
    isStringArray(candidate.isl_gloss) &&
    typeof candidate.confidence === 'number' &&
    Number.isFinite(candidate.confidence) &&
    candidate.confidence >= 0 &&
    candidate.confidence <= 1
  );
}
