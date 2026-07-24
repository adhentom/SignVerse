import type { ContentPacket } from '../../shared/contentPacket';
import type { InterpretationResponse } from '../../shared/interpretation';
import type { GlossProviderInput } from '../types';
import type {
  GlossInferenceBackend,
  GlossInferenceResult,
  InferredSegment,
} from './GlossInferenceBackend';

export interface InterpretationApiClient {
  interpret(packet: ContentPacket): Promise<InterpretationResponse>;
}

/**
 * Adapts the existing SignVerse interpretation API to the provider-neutral
 * inference contract. The server may use OpenAI, a local model, or rules.
 */
export class ApiGlossInferenceBackend implements GlossInferenceBackend {
  readonly id: string;

  constructor(
    private readonly client: InterpretationApiClient,
    backendId = 'signverse-api',
  ) {
    this.id = backendId;
  }

  async infer(input: GlossProviderInput): Promise<GlossInferenceResult> {
    const response = await this.client.interpret(toContentPacket(input));
    const segments = response.isl_segments?.length
      ? fromStructuredSegments(input, response)
      : fromFlatGlosses(input, response);
    return {
      segments,
      confidence: clamp(response.quality?.gloss_correctness ?? response.confidence),
      diagnostics: {
        backend: this.id,
        responseConfidence: response.confidence,
        quality: response.quality,
        backendDiagnostics: response.diagnostics,
      },
    };
  }
}

function toContentPacket(input: GlossProviderInput): ContentPacket {
  return {
    platform: input.context.platform,
    title: `${input.context.platform} interpretation`,
    speaker: input.context.speaker,
    timestamp: new Date().toISOString(),
    text: input.context.normalizedText,
    metadata: {
      locale: input.context.locale,
      previousTurns: [...input.context.previousTurns],
      semanticFirst: true,
    },
  };
}

function fromStructuredSegments(
  input: GlossProviderInput,
  response: InterpretationResponse,
): InferredSegment[] {
  return (response.isl_segments ?? []).map((segment, index) => ({
    sourceSegmentId: input.grammar[index]?.id ?? segment.segment_id,
    confidence: clamp(segment.confidence),
    diagnostics: {
      meaning: segment.meaning,
      discourseFunction: segment.discourse_function,
      backendSegmentId: segment.segment_id,
    },
    glosses: segment.glosses.map((unit) => ({
      concept: unit.referent || unit.gloss,
      gloss: unit.gloss,
      confidence: clamp(unit.confidence),
      category: unit.classifier ? 'classifier' : 'lexical',
      nonManualMarkers: unit.non_manual_markers,
    })),
  }));
}

function fromFlatGlosses(
  input: GlossProviderInput,
  response: InterpretationResponse,
): InferredSegment[] {
  if (response.isl_gloss.length === 0) return [];
  return [{
    sourceSegmentId: input.grammar[0]?.id ?? 'sentence-1-1',
    confidence: clamp(response.confidence),
    glosses: response.isl_gloss.map((gloss) => ({
      concept: gloss,
      gloss,
      confidence: clamp(response.confidence),
      category: 'lexical',
    })),
    diagnostics: { representation: 'flat-api-gloss' },
  }];
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
