import { describe, expect, it } from 'vitest';
import { appendPlayback, MAX_QUEUED_SIGNS, removeCompleted } from '../../playback/queue';

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

  it('preserves exact missing-token diagnostics while appending', () => {
    const miss = {
      token: 'UNKNOWN SIGN',
      normalized_token: 'unknown sign',
      reason: 'unknown-gloss' as const,
      detail: 'No governed lexicon entry matched this normalized gloss.',
    };
    const appended = appendPlayback(
      { items: [], unsupported_tokens: ['unknown:0:unknown-sign'], missing: [miss] },
      { items: [], unsupported_tokens: ['unknown:0:unknown-sign'], missing: [miss] },
    );

    expect(appended.missing).toEqual([miss]);
  });

  it('orders an incoming batch by priority without resetting queued playback', () => {
    const appended = appendPlayback(
      { items: [item('playing')], unsupported_tokens: [] },
      {
        items: [
          { ...item('normal'), priority: 0 },
          { ...item('urgent'), priority: 10 },
        ],
        unsupported_tokens: [],
      },
    );

    expect(appended.items.map((entry) => entry.token_id)).toEqual(['playing', 'urgent', 'normal']);
  });

  it('keeps the active prefix stable under a 1000-sign streaming load', () => {
    const initial = { items: [item('playing')], unsupported_tokens: [] };
    const incoming = Array.from({ length: MAX_QUEUED_SIGNS }, (_, index) => item(`sign-${index}`));

    const appended = appendPlayback(initial, { items: incoming, unsupported_tokens: [] });

    expect(appended.items).toHaveLength(MAX_QUEUED_SIGNS);
    expect(appended.items[0].token_id).toBe('playing');
    expect(appended.items.at(-1)?.token_id).toBe(`sign-${MAX_QUEUED_SIGNS - 2}`);
  });
});
