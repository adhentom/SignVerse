import type {
  AnimationPlan,
  AnimationPlanItem,
  SignMetadataEntry,
  TransitionRule,
  VocabularyMatch,
} from '../types';

export interface AnimationPlannerOptions {
  minimumConfidence?: number;
}

export class AnimationPlanner {
  private readonly signs = new Map<string, SignMetadataEntry>();

  constructor(
    signMetadata: readonly SignMetadataEntry[],
    private readonly transitions: readonly TransitionRule[],
  ) {
    for (const sign of signMetadata) {
      if (sign.reviewStatus === 'approved') this.signs.set(sign.tokenId, sign);
    }
  }

  plan(
    matches: readonly Extract<VocabularyMatch, { status: 'exact' | 'alias' }>[],
    options: AnimationPlannerOptions = {},
  ): AnimationPlan {
    const minimumConfidence = options.minimumConfidence ?? 0.7;
    const items: AnimationPlanItem[] = [];
    const missing: AnimationPlan['missing'][number][] = [];

    for (const match of matches) {
      const sign = this.signs.get(match.entry.tokenId);
      if (!sign) {
        missing.push({
          token: match.candidate.gloss,
          normalized_token: match.entry.gloss,
          reason: 'lexicon-token-without-asset',
          detail: `Approved token ${match.entry.tokenId} has no approved sign metadata.`,
        });
        continue;
      }
      const confidence = Math.min(match.candidate.confidence, sign.confidence);
      if (confidence < minimumConfidence) {
        missing.push({
          token: match.candidate.gloss,
          normalized_token: match.entry.gloss,
          reason: 'asset-unavailable',
          detail: `Asset confidence ${confidence.toFixed(2)} is below ${minimumConfidence.toFixed(2)}.`,
        });
        continue;
      }
      const previous = items.at(-1);
      items.push(Object.freeze({
        candidate: Object.freeze({ ...match.candidate, confidence }),
        vocabulary: match.entry,
        sign,
        transitionMs: this.transitionFor(previous?.vocabulary.category, match.entry.category),
      }));
    }
    return Object.freeze({ items: Object.freeze(items), missing: Object.freeze(missing) });
  }

  private transitionFor(
    from: AnimationPlanItem['vocabulary']['category'] | undefined,
    to: AnimationPlanItem['vocabulary']['category'],
  ): number {
    const rule = this.transitions.find((candidate) => (
      candidate.reviewStatus === 'approved'
      && (candidate.fromCategory === '*' || candidate.fromCategory === (from ?? '*'))
      && (candidate.toCategory === '*' || candidate.toCategory === to)
    ));
    return rule?.durationMs ?? 0;
  }
}
