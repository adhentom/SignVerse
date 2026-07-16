import { describe, expect, it } from 'vitest';
import { appendPlayback, removeCompleted } from '../../playback/queue';

describe('streaming playback queue', () => {
  const item = (token_id: string) => ({ token_id, asset_id: token_id, duration: 1, confidence: 1 });

  it('appends in sentence order and removes completed items', () => {
    const appended = appendPlayback(
      { items: [item('one')], unsupported_tokens: ['missing'] },
      { items: [item('two')], unsupported_tokens: ['missing', 'other'] },
    );
    expect(appended.items.map((entry) => entry.token_id)).toEqual(['one', 'two']);
    expect(appended.unsupported_tokens).toEqual(['missing', 'other']);
    expect(removeCompleted(appended, 1).items.map((entry) => entry.token_id)).toEqual(['two']);
  });
});
