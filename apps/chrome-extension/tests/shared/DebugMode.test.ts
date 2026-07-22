import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getIslDebugMode,
  ISL_DEBUG_STORAGE_KEY,
  setIslDebugMode,
} from '../../shared/debugMode';

describe('ISL debugging preference', () => {
  const get = vi.fn();
  const set = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('chrome', { storage: { local: { get, set } } });
    get.mockReset();
    set.mockReset();
  });

  it('defaults off and persists only an explicit local setting', async () => {
    get.mockResolvedValue({});
    set.mockResolvedValue(undefined);

    expect(await getIslDebugMode()).toBe(false);
    await setIslDebugMode(true);
    expect(set).toHaveBeenCalledWith({ [ISL_DEBUG_STORAGE_KEY]: true });
  });
});
