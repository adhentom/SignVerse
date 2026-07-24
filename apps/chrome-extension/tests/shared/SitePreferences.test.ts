import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addExcludedDomain,
  completeOnboarding,
  getSitePreferences,
  isDomainExcluded,
  isSiteEnabled,
  normalizeDomain,
  removeExcludedDomain,
  SITE_PREFERENCES_STORAGE_KEY,
  type SitePreferences,
} from '../../shared/sitePreferences';

describe('site preferences', () => {
  let preferences: SitePreferences | undefined;

  beforeEach(() => {
    preferences = undefined;
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ [SITE_PREFERENCES_STORAGE_KEY]: preferences })),
          set: vi.fn(async (value: Record<string, SitePreferences>) => {
            preferences = value[SITE_PREFERENCES_STORAGE_KEY];
          }),
        },
      },
    });
  });

  it('fails closed until onboarding is complete', async () => {
    const initial = await getSitePreferences();
    expect(isSiteEnabled('example.com', initial)).toBe(false);

    const enabled = await completeOnboarding();
    expect(isSiteEnabled('example.com', enabled)).toBe(true);
  });

  it('normalizes URL input and excludes matching subdomains', () => {
    expect(normalizeDomain(' HTTPS://Example.COM/path ')).toBe('example.com');
    expect(isDomainExcluded('docs.example.com', ['example.com'])).toBe(true);
    expect(isDomainExcluded('notexample.com', ['example.com'])).toBe(false);
  });

  it('persists exclusion additions and removals', async () => {
    preferences = { onboardingComplete: true, excludedDomains: [] };
    const excluded = await addExcludedDomain('https://video.example.com/watch');
    expect(excluded.excludedDomains).toEqual(['video.example.com']);
    expect(isSiteEnabled('video.example.com', excluded)).toBe(false);

    const restored = await removeExcludedDomain('video.example.com');
    expect(restored.excludedDomains).toEqual([]);
    expect(isSiteEnabled('video.example.com', restored)).toBe(true);
  });
});
