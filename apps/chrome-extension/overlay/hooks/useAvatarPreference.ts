import { useEffect, useRef, useState } from 'react';
import { AVATAR_PROFILES, DEFAULT_AVATAR, type AvatarProfileId } from '../../playback/avatarProfiles';

const STORAGE_KEY = 'signverse.avatarProfile';

export function useAvatarPreference() {
  const [id, setId] = useState<AvatarProfileId>(DEFAULT_AVATAR.id);
  const userSelected = useRef(false);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    let active = true;
    void chrome.storage.local.get(STORAGE_KEY)
      .then((value) => {
        const stored = value[STORAGE_KEY];
        if (active && !userSelected.current && AVATAR_PROFILES.some((profile) => profile.id === stored)) {
          setId(stored as AvatarProfileId);
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

  return { profile: AVATAR_PROFILES.find((candidate) => candidate.id === id) ?? DEFAULT_AVATAR, select };
}
