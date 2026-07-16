const MAX_SEGMENT_LENGTH = 500;

export function segmentText(text: string): string[] {
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n{2,}|(?<=[.!?।])\s+/u).map((value) => value.trim()).filter(Boolean);
  return blocks.flatMap((block) => {
    if (block.length <= MAX_SEGMENT_LENGTH) return [block];
    const segments: string[] = [];
    for (let start = 0; start < block.length; start += MAX_SEGMENT_LENGTH) {
      segments.push(block.slice(start, start + MAX_SEGMENT_LENGTH).trim());
    }
    return segments.filter(Boolean);
  });
}
