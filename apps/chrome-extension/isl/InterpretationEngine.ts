import { UnknownWordHandler } from './fallback/UnknownWordHandler';
import { ContextNormalizer } from './normalization/ContextNormalizer';
import { GrammarNormalizer } from './normalization/GrammarNormalizer';
import { GlossOptimizer } from './optimization/GlossOptimizer';
import { AnimationPlanner } from './planning/AnimationPlanner';
import { PlaybackPlanner } from './planning/PlaybackPlanner';
import type { ISLGlossProvider } from './providers/ISLGlossProvider';
import { SentenceSegmenter } from './segmentation/SentenceSegmenter';
import type {
  InterpretationDatabases,
  ISLInterpretationResult,
  SourceContext,
  VocabularyMatch,
} from './types';
import { VocabularyLookup } from './vocabulary/VocabularyLookup';

export interface InterpretationEngineOptions {
  minimumGlossConfidence?: number;
  minimumAssetConfidence?: number;
}

export class InterpretationEngine {
  private readonly segmenter = new SentenceSegmenter();
  private readonly contextNormalizer = new ContextNormalizer();
  private readonly grammarNormalizer = new GrammarNormalizer();
  private readonly optimizer = new GlossOptimizer();
  private readonly lookup: VocabularyLookup;
  private readonly unknowns = new UnknownWordHandler();
  private readonly animationPlanner: AnimationPlanner;
  private readonly playbackPlanner = new PlaybackPlanner();

  constructor(
    private readonly provider: ISLGlossProvider,
    databases: InterpretationDatabases,
    private readonly options: InterpretationEngineOptions = {},
  ) {
    this.lookup = new VocabularyLookup(databases.vocabulary);
    this.animationPlanner = new AnimationPlanner(
      databases.signMetadata,
      databases.transitionRules,
    );
  }

  async interpret(source: SourceContext): Promise<ISLInterpretationResult> {
    const context = this.contextNormalizer.normalize(source);
    const segments = this.segmenter.segment(context.normalizedText, context.locale);
    const grammar = this.grammarNormalizer.normalize(segments);
    const providerOutput = await this.provider.generate({ context, grammar });
    const glosses = this.optimizer.optimize(providerOutput.candidates, {
      minimumConfidence: this.options.minimumGlossConfidence,
    });

    const matches: Extract<VocabularyMatch, { status: 'exact' | 'alias' }>[] = [];
    const unsupported = [];
    for (const candidate of glosses) {
      const match = this.lookup.lookup(candidate);
      if (match.status !== 'missing') {
        matches.push(match);
        continue;
      }
      const resolution = this.unknowns.resolve(candidate);
      if (resolution.status === 'unsupported') {
        unsupported.push({
          token: candidate.gloss,
          normalized_token: candidate.gloss,
          reason: 'unknown-gloss' as const,
          detail: resolution.reason,
        });
        continue;
      }
      const letterMatches = resolution.candidates.map((letter) => this.lookup.lookup(letter));
      if (letterMatches.every((letter): letter is Extract<VocabularyMatch, { status: 'exact' | 'alias' }> => (
        letter.status !== 'missing'
      ))) {
        matches.push(...letterMatches);
      } else {
        unsupported.push({
          token: candidate.gloss,
          normalized_token: candidate.gloss,
          reason: 'unknown-gloss' as const,
          detail: 'The approved fingerspelling inventory does not cover every character.',
        });
      }
    }

    const planned = this.animationPlanner.plan(matches, {
      minimumConfidence: this.options.minimumAssetConfidence,
    });
    const animationPlan = Object.freeze({
      items: planned.items,
      missing: Object.freeze([...unsupported, ...planned.missing]),
    });
    return Object.freeze({
      segments,
      context,
      grammar,
      glosses,
      animationPlan,
      playback: this.playbackPlanner.plan(animationPlan),
    });
  }
}
