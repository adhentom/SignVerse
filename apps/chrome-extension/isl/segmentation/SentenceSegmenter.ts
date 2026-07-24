import type { SentenceSegment } from '../types';

const MAX_SEGMENT_LENGTH = 500;

export class SentenceSegmenter {
  segment(text: string, locale = 'en'): readonly SentenceSegment[] {
    const normalized = text.replace(/\r\n?/gu, '\n').trim();
    if (!normalized) return [];

    const boundaries = this.boundaries(normalized, locale);
    return boundaries.flatMap((part, index) => this.splitLong(part.text, part.start, index));
  }

  private boundaries(text: string, locale: string): Array<{ text: string; start: number }> {
    if (typeof Intl.Segmenter === 'function') {
      const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
      return [...segmenter.segment(text)].flatMap(({ segment, index }) => {
        const value = segment.trim();
        return value ? [{ text: value, start: index + segment.indexOf(value) }] : [];
      });
    }
    const result: Array<{ text: string; start: number }> = [];
    const pattern = /[^.!?।]+[.!?।]?/gu;
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim();
      if (value) result.push({ text: value, start: (match.index ?? 0) + match[0].indexOf(value) });
    }
    return result;
  }

  private splitLong(text: string, baseOffset: number, parentIndex: number): SentenceSegment[] {
    const parts: SentenceSegment[] = [];
    let cursor = 0;
    while (cursor < text.length) {
      const requestedEnd = Math.min(text.length, cursor + MAX_SEGMENT_LENGTH);
      const whitespace = requestedEnd < text.length ? text.lastIndexOf(' ', requestedEnd) : requestedEnd;
      const end = whitespace > cursor ? whitespace : requestedEnd;
      const value = text.slice(cursor, end).trim();
      if (value) {
        const start = text.indexOf(value, cursor);
        parts.push({
          id: `sentence-${parentIndex + 1}-${parts.length + 1}`,
          text: value,
          start: baseOffset + start,
          end: baseOffset + start + value.length,
        });
      }
      cursor = Math.max(end, cursor + 1);
      while (text[cursor] === ' ') cursor += 1;
    }
    return parts;
  }
}
