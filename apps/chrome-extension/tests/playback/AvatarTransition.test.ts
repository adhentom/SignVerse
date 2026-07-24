import { describe, expect, it } from 'vitest';

import { avatarTransitionDuration } from '../../overlay/components/AvatarRenderer';

describe('avatar sign transitions', () => {
  it('uses a smooth bounded transition for normal playback', () => {
    expect(avatarTransitionDuration(undefined, false)).toBe(180);
    expect(avatarTransitionDuration({
      token_id: 'hello',
      asset_id: 'hello',
      confidence: 1,
      duration: 1,
      transition_ms: 20,
    }, false)).toBe(120);
    expect(avatarTransitionDuration({
      token_id: 'welcome',
      asset_id: 'welcome',
      confidence: 1,
      duration: 1,
      transition_ms: 5_000,
    }, false)).toBe(500);
  });

  it('disables cross-fades when reduced motion is requested', () => {
    expect(avatarTransitionDuration({
      token_id: 'hello',
      asset_id: 'hello',
      confidence: 1,
      duration: 1,
      transition_ms: 300,
    }, true)).toBe(0);
  });
});
