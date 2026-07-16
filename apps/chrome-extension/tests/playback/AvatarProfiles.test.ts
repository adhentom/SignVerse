import { describe, expect, it } from 'vitest';
import { AVATAR_PROFILES } from '../../playback/avatarProfiles';

describe('avatar profiles', () => {
  it('provides all accessible interpreter choices with stable IDs', () => {
    expect(AVATAR_PROFILES.map((profile) => profile.id)).toEqual([
      'adult-female', 'adult-male', 'young-girl', 'young-boy', 'neutral', 'robot',
    ]);
    expect(new Set(AVATAR_PROFILES.map((profile) => profile.id)).size).toBe(6);
    expect(AVATAR_PROFILES.map((profile) => profile.label)).toEqual([
      'Adult female', 'Adult male', 'Teen girl', 'Teen boy', 'Assistant', 'Robot',
    ]);
  });
});
