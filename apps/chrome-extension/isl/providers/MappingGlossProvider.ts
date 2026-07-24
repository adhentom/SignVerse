import type { ISLGlossProvider } from './ISLGlossProvider';
import type { GlossMapping, GlossProviderInput, GlossProviderOutput } from '../types';
import { normalizeLookupTerm } from '../vocabulary/normalizeLookupTerm';

/**
 * Deterministic baseline provider. It emits only reviewer-approved mappings;
 * unknown input remains unknown for downstream fallback handling.
 */
export class MappingGlossProvider implements ISLGlossProvider {
  readonly id = 'reviewed-mappings';
  private readonly mappings = new Map<string, GlossMapping>();

  constructor(mappings: readonly GlossMapping[]) {
    for (const mapping of mappings) {
      if (mapping.reviewStatus === 'approved') {
        this.mappings.set(`${mapping.locale}:${normalizeLookupTerm(mapping.source)}`, mapping);
      }
    }
  }

  async generate(input: GlossProviderInput): Promise<GlossProviderOutput> {
    const candidates = input.grammar.flatMap((unit) => {
      const mapping = this.mappings.get(
        `${input.context.locale}:${normalizeLookupTerm(unit.text)}`,
      );
      if (!mapping) return [];
      return mapping.canonicalGlosses.map((gloss, index) => ({
        id: `${unit.id}-gloss-${index + 1}`,
        sourceSegmentId: unit.id,
        concept: gloss,
        gloss,
        confidence: 1,
        category: 'lexical' as const,
      }));
    });
    return {
      candidates,
      confidence: candidates.length > 0 ? 1 : 0,
      diagnostics: { provider: this.id, approvedMappingsOnly: true },
    };
  }
}
