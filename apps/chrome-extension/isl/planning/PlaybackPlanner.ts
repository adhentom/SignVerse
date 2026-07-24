import type { PlaybackSequence } from '../../shared/interpretation';
import type { AnimationPlan } from '../types';

export class PlaybackPlanner {
  plan(animation: AnimationPlan): PlaybackSequence {
    return {
      items: animation.items.map(({ candidate, vocabulary, sign, transitionMs }) => ({
        token_id: vocabulary.tokenId,
        asset_id: sign.assetId,
        duration: sign.durationSeconds,
        confidence: candidate.confidence,
        source_gloss: candidate.gloss,
        transition_ms: transitionMs,
        non_manual_markers: candidate.nonManualMarkers ? [...candidate.nonManualMarkers] : undefined,
        animation_ready: sign.animationAvailable,
      })),
      unsupported_tokens: animation.missing.map((miss) => miss.token),
      missing: [...animation.missing],
    };
  }
}
