import { describe, expect, it } from 'vitest';
import {
  AVATAR_PROFILES,
  DEFAULT_AVATAR,
  migrateAvatarProfileId,
} from '../../playback/avatarProfiles';

describe('avatar profiles', () => {
  it('provides the two production interpreter choices with stable IDs', () => {
    expect(AVATAR_PROFILES.map((profile) => profile.id)).toEqual([
      'adult-female', 'adult-male',
    ]);
    expect(new Set(AVATAR_PROFILES.map((profile) => profile.id)).size).toBe(2);
    expect(AVATAR_PROFILES.map((profile) => profile.label)).toEqual([
      'Girl avatar', 'Boy avatar',
    ]);
    expect(DEFAULT_AVATAR.id).toBe('adult-female');
    expect(AVATAR_PROFILES.every((profile) => profile.rigId === 'signverse-hierarchical-svg-v2'))
      .toBe(true);
  });

  it('migrates legacy avatar preferences to the supported pair', () => {
    expect(migrateAvatarProfileId('young-girl')).toBe('adult-female');
    expect(migrateAvatarProfileId('neutral')).toBe('adult-female');
    expect(migrateAvatarProfileId('robot')).toBe('adult-female');
    expect(migrateAvatarProfileId('young-boy')).toBe('adult-male');
    expect(migrateAvatarProfileId('adult-male')).toBe('adult-male');
    expect(migrateAvatarProfileId('unknown')).toBe('adult-female');
  });
});
