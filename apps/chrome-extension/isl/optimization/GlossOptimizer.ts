import type { GlossCandidate } from '../types';

export interface GlossOptimizationOptions {
  minimumConfidence?: number;
}

export class GlossOptimizer {
  optimize(
    candidates: readonly GlossCandidate[],
    options: GlossOptimizationOptions = {},
  ): readonly GlossCandidate[] {
    const minimum = options.minimumConfidence ?? 0;
    const result: GlossCandidate[] = [];

    for (const candidate of candidates) {
      const gloss = canonicalGloss(candidate.gloss);
      const confidence = clamp(candidate.confidence);
      if (!gloss || confidence < minimum) continue;
      const optimized = Object.freeze({ ...candidate, gloss, confidence });
      const previous = result.at(-1);
      if (
        previous?.gloss === optimized.gloss
        && previous.sourceSegmentId === optimized.sourceSegmentId
      ) {
        if (optimized.confidence > previous.confidence) result[result.length - 1] = optimized;
        continue;
      }
      result.push(optimized);
    }
    return Object.freeze(result);
  }
}

function canonicalGloss(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/[_\s]+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .toLocaleUpperCase('en');
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
