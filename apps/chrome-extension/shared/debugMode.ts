export const ISL_DEBUG_STORAGE_KEY = 'signverseIslDebugMode';

export async function getIslDebugMode(): Promise<boolean> {
  const stored = await chrome.storage.local.get(ISL_DEBUG_STORAGE_KEY);
  return stored[ISL_DEBUG_STORAGE_KEY] === true;
}

export async function setIslDebugMode(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [ISL_DEBUG_STORAGE_KEY]: enabled });
}
