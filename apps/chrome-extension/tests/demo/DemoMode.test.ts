import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoLiveSnapshot, DEMO_INTERPRETATION } from '../../content/demo/demoFixtures';
import { DEMO_MODE_STORAGE_KEY, loadDemoMode, saveDemoMode } from '../../content/demo/demoMode';
import { signAssetRegistry } from '../../playback/AssetRegistry';
import { isInterpretationResponse } from '../../shared/interpretation';

describe('Hackathon Demo Mode', () => {
  const storage: Record<string, unknown> = {};

  beforeEach(() => {
    for (const key of Object.keys(storage)) delete storage[key];
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => Object.assign(storage, value)),
        },
      },
    });
  });

  it('is disabled by default and persists explicit changes', async () => {
    expect(await loadDemoMode()).toBe(false);
    await saveDemoMode(true);
    expect(storage[DEMO_MODE_STORAGE_KEY]).toBe(true);
    expect(await loadDemoMode()).toBe(true);
  });

  it('provides a complete locally playable interpretation', () => {
    expect(isInterpretationResponse(DEMO_INTERPRETATION)).toBe(true);
    expect(DEMO_INTERPRETATION.malayalam_translation).not.toBe('');
    expect(DEMO_INTERPRETATION.isl_gloss.length).toBeGreaterThan(0);
    expect(DEMO_INTERPRETATION.playback?.items.length).toBeGreaterThan(0);
    for (const item of DEMO_INTERPRETATION.playback?.items ?? []) {
      const asset = signAssetRegistry.lookup(item.asset_id);
      expect(asset?.source.startsWith('http')).toBe(false);
      expect(asset?.token_id).toBe(item.token_id);
    }
  });

  it.each([
    ['youtube', 'YouTube'],
    ['google-meet', 'Google Meet'],
  ])('provides offline %s captions', (id, displayName) => {
    const snapshot = createDemoLiveSnapshot({ id, displayName, modeLabel: '', statusLabel: '' });
    expect(snapshot?.currentPacket?.text).not.toBe('');
    expect(snapshot?.currentPacket?.metadata.demo).toBe(true);
  });
});
