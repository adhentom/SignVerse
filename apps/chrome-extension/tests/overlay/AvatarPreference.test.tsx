import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAvatarPreference } from '../../overlay/hooks/useAvatarPreference';

function Harness() {
  const avatar = useAvatarPreference();
  return (
    <button onClick={() => avatar.select('adult-male')} type="button">
      {avatar.profile.id}
    </button>
  );
}

describe('useAvatarPreference', () => {
  let container: HTMLDivElement;
  let root: Root;
  const set = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('migrates a legacy profile and persists a new selection', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ 'signverse.avatarProfile': 'young-boy' }),
          set,
        },
      },
    });

    await act(async () => root.render(<Harness />));
    await act(async () => undefined);
    expect(container.textContent).toBe('adult-male');
    expect(set).toHaveBeenCalledWith({ 'signverse.avatarProfile': 'adult-male' });

    act(() => container.querySelector('button')?.click());
    expect(set).toHaveBeenCalledWith({ 'signverse.avatarProfile': 'adult-male' });
  });
});
