import type { GrammarUnit, SentenceSegment } from '../types';

const NEGATION = new Set(['no', 'not', 'never', "don't", "doesn't", "didn't", "can't", 'cannot', "won't"]);
const MODALITY = new Set(['can', 'could', 'may', 'might', 'must', 'should', 'will', 'would']);
const PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);
const TIME = new Set(['today', 'tomorrow', 'yesterday', 'now', 'later', 'before', 'after', 'morning', 'evening']);

export class GrammarNormalizer {
  normalize(segments: readonly SentenceSegment[]): readonly GrammarUnit[] {
    return segments.map((segment) => {
      const tokens = tokenize(segment.text);
      const lower = tokens.map((token) => token.toLocaleLowerCase('en'));
      return Object.freeze({
        id: segment.id,
        text: segment.text,
        tokens: Object.freeze(tokens),
        features: Object.freeze({
          sentenceType: sentenceType(segment.text, lower),
          polarity: lower.some((token) => NEGATION.has(token)) ? 'negative' : 'positive',
          modality: Object.freeze(lower.filter((token) => MODALITY.has(token))),
          pronouns: Object.freeze(lower.filter((token) => PRONOUNS.has(token))),
          temporalMarkers: Object.freeze(lower.filter((token) => TIME.has(token))),
        }),
      });
    });
  }
}

function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
}

function sentenceType(
  text: string,
  tokens: readonly string[],
): GrammarUnit['features']['sentenceType'] {
  if (text.trim().endsWith('?')) return 'question';
  if (tokens.length === 0) return 'fragment';
  if (['please', 'do', 'stop', 'open', 'close', 'go', 'come'].includes(tokens[0])) return 'command';
  return /[.!]$/u.test(text.trim()) ? 'statement' : 'fragment';
}
