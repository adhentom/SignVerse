import type { NormalizedContext, SourceContext } from '../types';

export class ContextNormalizer {
  normalize(source: SourceContext): NormalizedContext {
    const sourceText = source.text.normalize('NFC').trim();
    return Object.freeze({
      sourceText,
      normalizedText: normalizeSpacing(sourceText),
      locale: source.locale?.trim() || 'en',
      platform: source.platform?.trim() || 'website',
      speaker: source.speaker?.trim() || undefined,
      previousTurns: Object.freeze(
        (source.previousTurns ?? [])
          .map((turn) => normalizeSpacing(turn.normalize('NFC')))
          .filter(Boolean)
          .slice(-8),
      ),
    });
  }
}

function normalizeSpacing(value: string): string {
  return value
    .replace(/[\u00a0\u2007\u202f]/gu, ' ')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\s*\n\s*/gu, '\n')
    .trim();
}
