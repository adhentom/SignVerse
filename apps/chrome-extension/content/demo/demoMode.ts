import { useEffect, useState } from 'react';

export const DEMO_MODE_STORAGE_KEY = 'signverse.demoMode';

export async function loadDemoMode(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return false;
  const stored = await chrome.storage.local.get(DEMO_MODE_STORAGE_KEY);
  return stored[DEMO_MODE_STORAGE_KEY] === true;
}

export async function saveDemoMode(enabled: boolean): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [DEMO_MODE_STORAGE_KEY]: enabled });
}

export function useDemoMode() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void loadDemoMode()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  function update(next: boolean) {
    setEnabled(next);
    void saveDemoMode(next).catch(() => undefined);
  }

  return { enabled, loaded, setEnabled: update };
}
