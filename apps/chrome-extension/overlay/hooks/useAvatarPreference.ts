import { useEffect, useRef, useState } from 'react';
import { AVATAR_PROFILES, DEFAULT_AVATAR, type AvatarProfileId } from '../../playback/avatarProfiles';

const STORAGE_KEY = 'signverse.avatarProfile';
const SCALE_STORAGE_KEY = 'signverse.avatarScales';

export function useAvatarPreference() {
  const [id, setId] = useState<AvatarProfileId>(DEFAULT_AVATAR.id);
  const userSelected = useRef(false);
  const [scales, setScales] = useState<Partial<Record<AvatarProfileId, number>>>({});

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    let active = true;
    void chrome.storage.local.get([STORAGE_KEY, SCALE_STORAGE_KEY])
      .then((value) => {
        const stored = value[STORAGE_KEY];
        if (active && !userSelected.current && AVATAR_PROFILES.some((profile) => profile.id === stored)) {
          setId(stored as AvatarProfileId);
        }
        if (active && value[SCALE_STORAGE_KEY] && typeof value[SCALE_STORAGE_KEY] === 'object') {
          setScales(value[SCALE_STORAGE_KEY] as Partial<Record<AvatarProfileId, number>>);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const select = (next: AvatarProfileId) => {
    userSelected.current = true;
    setId(next);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local.set({ [STORAGE_KEY]: next }).catch(() => undefined);
    }
  };

  const setScale = (scale: number) => {
    const next = { ...scales, [id]: Math.min(1.3, Math.max(0.7, scale)) };
    setScales(next);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local.set({ [SCALE_STORAGE_KEY]: next }).catch(() => undefined);
    }
  };

  const base = AVATAR_PROFILES.find((candidate) => candidate.id === id) ?? DEFAULT_AVATAR;
  const scale = scales[id] ?? 1;
  return { profile: { ...base, scale: base.scale * scale }, scale, select, setScale };
}
