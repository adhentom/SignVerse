export interface BackendConfig {
  baseUrl: string;
  timeoutMs: number;
}

interface BackendEnvironment {
  VITE_SIGNVERSE_BACKEND_URL?: string;
  VITE_SIGNVERSE_BACKEND_TIMEOUT_MS?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export function getBackendConfig(
  environment: BackendEnvironment = {
    VITE_SIGNVERSE_BACKEND_URL: import.meta.env.VITE_SIGNVERSE_BACKEND_URL,
    VITE_SIGNVERSE_BACKEND_TIMEOUT_MS: import.meta.env.VITE_SIGNVERSE_BACKEND_TIMEOUT_MS,
  },
): BackendConfig {
  const rawUrl = environment.VITE_SIGNVERSE_BACKEND_URL?.trim();
  if (!rawUrl) {
    return { baseUrl: '', timeoutMs: DEFAULT_TIMEOUT_MS };
  }

  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('The configured SignVerse backend URL is invalid.');
  }

  const configuredTimeout = Number(environment.VITE_SIGNVERSE_BACKEND_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_TIMEOUT_MS;

  return {
    baseUrl: url.toString().replace(/\/$/, ''),
    timeoutMs,
  };
}
