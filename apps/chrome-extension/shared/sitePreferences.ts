export const SITE_PREFERENCES_STORAGE_KEY = 'signverseSitePreferences';

export interface SitePreferences {
  onboardingComplete: boolean;
  excludedDomains: string[];
}

export const DEFAULT_SITE_PREFERENCES: SitePreferences = {
  onboardingComplete: false,
  excludedDomains: [],
};

function normalizeStoredPreferences(value: unknown): SitePreferences {
  if (!value || typeof value !== 'object') return DEFAULT_SITE_PREFERENCES;
  const candidate = value as Partial<SitePreferences>;
  const excludedDomains = Array.isArray(candidate.excludedDomains)
    ? [...new Set(candidate.excludedDomains
      .filter((domain): domain is string => typeof domain === 'string')
      .map(normalizeDomain)
      .filter(Boolean))]
    : [];
  return {
    onboardingComplete: candidate.onboardingComplete === true,
    excludedDomains,
  };
}

export function normalizeDomain(value: string): string {
  const input = value.trim().toLowerCase();
  if (!input) return '';
  try {
    const parsed = new URL(input.includes('://') ? input : `https://${input}`);
    return parsed.hostname.replace(/^\.+|\.+$/gu, '');
  } catch {
    return '';
  }
}

export function isDomainExcluded(hostname: string, excludedDomains: string[]): boolean {
  const normalizedHostname = normalizeDomain(hostname);
  return excludedDomains.some((domain) => {
    const normalizedDomain = normalizeDomain(domain);
    return normalizedDomain !== '' && (
      normalizedHostname === normalizedDomain ||
      normalizedHostname.endsWith(`.${normalizedDomain}`)
    );
  });
}

export function isSiteEnabled(hostname: string, preferences: SitePreferences): boolean {
  return preferences.onboardingComplete &&
    !isDomainExcluded(hostname, preferences.excludedDomains);
}

export async function getSitePreferences(): Promise<SitePreferences> {
  const stored = await chrome.storage.local.get(SITE_PREFERENCES_STORAGE_KEY);
  return normalizeStoredPreferences(stored[SITE_PREFERENCES_STORAGE_KEY]);
}

export async function setSitePreferences(preferences: SitePreferences): Promise<void> {
  await chrome.storage.local.set({
    [SITE_PREFERENCES_STORAGE_KEY]: normalizeStoredPreferences(preferences),
  });
}

export async function completeOnboarding(): Promise<SitePreferences> {
  const current = await getSitePreferences();
  const next = { ...current, onboardingComplete: true };
  await setSitePreferences(next);
  return next;
}

export async function setDomainEnabled(
  hostname: string,
  enabled: boolean,
): Promise<SitePreferences> {
  const domain = normalizeDomain(hostname);
  if (!domain) throw new Error('Enter a valid website domain.');
  const current = await getSitePreferences();
  const excludedDomains = enabled
    ? current.excludedDomains.filter((item) => normalizeDomain(item) !== domain)
    : [...new Set([...current.excludedDomains, domain])].sort();
  const next = { ...current, excludedDomains };
  await setSitePreferences(next);
  return next;
}

export async function addExcludedDomain(value: string): Promise<SitePreferences> {
  return setDomainEnabled(value, false);
}

export async function removeExcludedDomain(value: string): Promise<SitePreferences> {
  return setDomainEnabled(value, true);
}

export function preferencesFromStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
): SitePreferences | null {
  const change = changes[SITE_PREFERENCES_STORAGE_KEY];
  return change ? normalizeStoredPreferences(change.newValue) : null;
}
