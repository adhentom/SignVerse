export const VISIBILITY_STORAGE_KEY = 'signverseVisible';

export async function getSignVerseVisible(): Promise<boolean> {
  const stored = await chrome.storage.local.get(VISIBILITY_STORAGE_KEY);
  return stored[VISIBILITY_STORAGE_KEY] === true;
}

export async function setSignVerseVisible(visible: boolean): Promise<void> {
  await chrome.storage.local.set({ [VISIBILITY_STORAGE_KEY]: visible });
}
