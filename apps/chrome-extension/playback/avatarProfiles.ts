export type AvatarProfileId = 'adult-female' | 'adult-male';
export type AvatarArtworkSet = 'signverse-female-v1' | 'signverse-male-v1';

export interface AvatarProfile {
  id: AvatarProfileId;
  label: string;
  artworkSet: AvatarArtworkSet;
  rigId: 'signverse-hierarchical-svg-v2';
  color: number;
  scale: number;
}

export const AVATAR_PROFILES: readonly AvatarProfile[] = [
  {
    id: 'adult-female',
    label: 'Girl avatar',
    artworkSet: 'signverse-female-v1',
    rigId: 'signverse-hierarchical-svg-v2',
    color: 0x665ee8,
    scale: 1,
  },
  {
    id: 'adult-male',
    label: 'Boy avatar',
    artworkSet: 'signverse-male-v1',
    rigId: 'signverse-hierarchical-svg-v2',
    color: 0x315db8,
    scale: 1,
  },
];

export const DEFAULT_AVATAR = AVATAR_PROFILES[0];

const LEGACY_PROFILE_MIGRATION: Record<string, AvatarProfileId> = {
  'adult-female': 'adult-female',
  'young-girl': 'adult-female',
  neutral: 'adult-female',
  robot: 'adult-female',
  'adult-male': 'adult-male',
  'young-boy': 'adult-male',
};

export function migrateAvatarProfileId(value: unknown): AvatarProfileId {
  return typeof value === 'string'
    ? LEGACY_PROFILE_MIGRATION[value] ?? DEFAULT_AVATAR.id
    : DEFAULT_AVATAR.id;
}
