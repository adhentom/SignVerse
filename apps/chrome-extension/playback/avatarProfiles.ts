export type AvatarProfileId = 'adult-female' | 'adult-male' | 'young-girl' | 'young-boy' | 'neutral' | 'robot';

export interface AvatarProfile {
  id: AvatarProfileId;
  label: string;
  color: number;
  scale: number;
}

export const AVATAR_PROFILES: readonly AvatarProfile[] = [
  { id: 'adult-female', label: 'Adult female', color: 0x8b5cf6, scale: 1 },
  { id: 'adult-male', label: 'Adult male', color: 0x2563eb, scale: 1.04 },
  { id: 'young-girl', label: 'Young girl', color: 0xec4899, scale: 0.88 },
  { id: 'young-boy', label: 'Young boy', color: 0x22c55e, scale: 0.9 },
  { id: 'neutral', label: 'Neutral assistant', color: 0x7c6cff, scale: 1 },
  { id: 'robot', label: 'Robot', color: 0x06b6d4, scale: 1 },
];

export const DEFAULT_AVATAR = AVATAR_PROFILES[4];
