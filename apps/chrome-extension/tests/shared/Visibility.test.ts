import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSignVerseVisible,
  setSignVerseVisible,
  VISIBILITY_STORAGE_KEY,
} from '../../shared/visibility';

describe('SignVerse visibility preference', () => {
  const get = vi.fn();
  const set = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('chrome', { storage: { local: { get, set } } });
    get.mockReset();
    set.mockReset();
  });

  it('defaults to hidden and persists an explicit user choice', async () => {
    get.mockResolvedValue({});
    set.mockResolvedValue(undefined);

    expect(await getSignVerseVisible()).toBe(false);
    await setSignVerseVisible(true);
    expect(set).toHaveBeenCalledWith({ [VISIBILITY_STORAGE_KEY]: true });
  });
});
