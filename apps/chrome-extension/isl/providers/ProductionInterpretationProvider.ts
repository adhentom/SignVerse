import { FingerSpeller } from '../fallback/FingerSpeller';
import type {
  GlossCandidate,
  GlossProviderInput,
  GlossProviderOutput,
  SegmentInterpretationDiagnostics,
  VocabularyEntry,
} from '../types';
import { normalizeLookupTerm } from '../vocabulary/normalizeLookupTerm';
import { VocabularyLookup } from '../vocabulary/VocabularyLookup';
import type { GlossInferenceBackend, InferredGloss } from './GlossInferenceBackend';
import type { InterpretationProvider } from './InterpretationProvider';

export interface ProductionProviderOptions {
  minimumInferenceConfidence?: number;
  fingerspellingConfidenceFactor?: number;
}

export class ProductionInterpretationProvider implements InterpretationProvider {
  readonly id = 'production-interpretation';
  readonly backendId: string;
  private readonly lookup: VocabularyLookup;
  private readonly fingerSpeller = new FingerSpeller();
  private readonly minimumInferenceConfidence: number;
  private readonly fingerspellingConfidenceFactor: number;

  constructor(
    private readonly backend: GlossInferenceBackend,
    private readonly vocabulary: readonly VocabularyEntry[],
    options: ProductionProviderOptions = {},
  ) {
    this.backendId = backend.id;
    this.lookup = new VocabularyLookup(vocabulary);
    this.minimumInferenceConfidence = options.minimumInferenceConfidence ?? 0.55;
    this.fingerspellingConfidenceFactor = options.fingerspellingConfidenceFactor ?? 0.8;
  }

  async generate(input: GlossProviderInput): Promise<GlossProviderOutput> {
    const inference = await this.backend.infer(input);
    const candidates: GlossCandidate[] = [];
    const segmentDiagnostics: SegmentInterpretationDiagnostics[] = [];

    for (const segment of inference.segments) {
      const accepted: string[] = [];
      const fingerspelled: string[] = [];
      const rejected: Array<{ gloss: string; reason: string }> = [];

      for (const [index, inferred] of segment.glosses.entries()) {
        const candidate = this.toCandidate(segment.sourceSegmentId, inferred, index);
        if (candidate.confidence < this.minimumInferenceConfidence) {
          rejected.push({
            gloss: inferred.gloss,
            reason: `Inference confidence is below ${this.minimumInferenceConfidence.toFixed(2)}.`,
          });
          continue;
        }

        const match = this.lookup.lookup(candidate);
        if (match.status !== 'missing') {
          candidates.push(this.canonicalCandidate(candidate, match.entry));
          accepted.push(match.entry.gloss);
          continue;
        }

        const fallback = this.fingerspell(candidate);
        if (fallback) {
          candidates.push(...fallback);
          fingerspelled.push(candidate.gloss);
        } else {
          rejected.push({
            gloss: inferred.gloss,
            reason: 'No approved vocabulary entry or complete approved fingerspelling sequence.',
          });
        }
      }

      segmentDiagnostics.push(Object.freeze({
        segmentId: segment.sourceSegmentId,
        confidence: clamp(segment.confidence),
        receivedGlosses: Object.freeze(segment.glosses.map(({ gloss }) => gloss)),
        acceptedGlosses: Object.freeze(accepted),
        fingerspelledGlosses: Object.freeze(fingerspelled),
        rejectedGlosses: Object.freeze(rejected),
        backendDiagnostics: segment.diagnostics,
      }));
    }

    return {
      candidates: Object.freeze(candidates),
      confidence: clamp(inference.confidence),
      diagnostics: Object.freeze({
        provider: this.id,
        backend: this.backendId,
        governedVocabularyOnly: true,
        backendDiagnostics: inference.diagnostics,
      }),
      segmentDiagnostics: Object.freeze(segmentDiagnostics),
    };
  }

  private toCandidate(
    sourceSegmentId: string,
    inferred: InferredGloss,
    index: number,
  ): GlossCandidate {
    return {
      id: `${sourceSegmentId}-inference-${index + 1}`,
      sourceSegmentId,
      concept: inferred.concept,
      gloss: inferred.gloss,
      confidence: clamp(inferred.confidence),
      category: inferred.category ?? 'lexical',
      nonManualMarkers: inferred.nonManualMarkers,
    };
  }

  private canonicalCandidate(
    candidate: GlossCandidate,
    entry: VocabularyEntry,
  ): GlossCandidate {
    return Object.freeze({
      ...candidate,
      concept: entry.concept,
      gloss: entry.gloss,
      category: entry.category,
    });
  }

  private fingerspell(candidate: GlossCandidate): readonly GlossCandidate[] | undefined {
    const words = normalizeLookupTerm(candidate.concept).split(' ').filter(Boolean);
    if (words.length === 0) return undefined;
    const governed: GlossCandidate[] = [];

    for (const [wordIndex, word] of words.entries()) {
      const letters = this.fingerSpeller.spell({
        ...candidate,
        id: `${candidate.id}-word-${wordIndex + 1}`,
        concept: word,
        category: 'proper-noun',
      });
      if (!letters) return undefined;
      for (const letter of letters) {
        const match = this.lookup.lookup(letter);
        if (match.status === 'missing' || match.entry.category !== 'fingerspelling') {
          return undefined;
        }
        governed.push(Object.freeze({
          ...this.canonicalCandidate(letter, match.entry),
          confidence: clamp(candidate.confidence * this.fingerspellingConfidenceFactor),
        }));
      }
    }
    return Object.freeze(governed);
  }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
