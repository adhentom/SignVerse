import type { RenderingHealthDiagnostics } from '../../types';

export interface BrowserCapabilityEnvironment {
  userAgent: string;
  brave: boolean;
  animationFrame: boolean;
  cancelAnimationFrame: boolean;
  matchMedia: boolean;
  forcedColors: boolean;
  reducedMotion: boolean;
  webGl: boolean;
  performanceMemory: boolean;
}

export interface BrowserCapabilityReport extends BrowserCapabilityEnvironment {
  family: RenderingHealthDiagnostics['browserFamily'];
  supported: boolean;
  degradedFeatures: readonly string[];
}

interface NavigatorWithBrave extends Navigator {
  brave?: unknown;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize?: number;
  };
}

export function browserCapabilityEnvironment(): BrowserCapabilityEnvironment {
  const navigatorValue = typeof navigator === 'undefined'
    ? undefined
    : navigator as NavigatorWithBrave;
  const match = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window)
    : undefined;
  return {
    userAgent: navigatorValue?.userAgent ?? '',
    brave: Boolean(navigatorValue?.brave),
    animationFrame: typeof globalThis.requestAnimationFrame === 'function',
    cancelAnimationFrame: typeof globalThis.cancelAnimationFrame === 'function',
    matchMedia: Boolean(match),
    forcedColors: match?.('(forced-colors: active)').matches ?? false,
    reducedMotion: match?.('(prefers-reduced-motion: reduce)').matches ?? false,
    webGl: typeof globalThis.WebGLRenderingContext !== 'undefined' ||
      typeof globalThis.WebGL2RenderingContext !== 'undefined',
    performanceMemory: Number.isFinite(
      (globalThis.performance as PerformanceWithMemory | undefined)?.memory?.usedJSHeapSize,
    ),
  };
}

export function detectBrowserCapabilities(
  environment: BrowserCapabilityEnvironment = browserCapabilityEnvironment(),
): BrowserCapabilityReport {
  const family = detectFamily(environment.userAgent, environment.brave);
  const degradedFeatures: string[] = [];
  if (!environment.animationFrame || !environment.cancelAnimationFrame) {
    degradedFeatures.push('animation-frame');
  }
  if (!environment.matchMedia) degradedFeatures.push('media-preferences');
  if (!environment.webGl) degradedFeatures.push('webgl-renderers');
  if (!environment.performanceMemory) degradedFeatures.push('memory-telemetry');
  return Object.freeze({
    ...environment,
    family,
    supported: family !== 'unknown',
    degradedFeatures: Object.freeze(degradedFeatures),
  });
}

export function estimatedBrowserMemoryUsage(): {
  bytes: number;
  source: RenderingHealthDiagnostics['memoryEstimateSource'];
} {
  const memory = (globalThis.performance as PerformanceWithMemory | undefined)?.memory;
  const bytes = memory?.usedJSHeapSize;
  return Number.isFinite(bytes) && bytes! >= 0
    ? { bytes: bytes!, source: 'performance-api' }
    : { bytes: 0, source: 'unavailable' };
}

function detectFamily(
  userAgent: string,
  brave: boolean,
): RenderingHealthDiagnostics['browserFamily'] {
  if (brave) return 'brave';
  if (/\bEdg(?:A|iOS)?\//u.test(userAgent)) return 'edge';
  if (/\bChromium\//u.test(userAgent)) return 'chromium';
  if (/\b(?:Chrome|CriOS)\//u.test(userAgent)) return 'chrome';
  return 'unknown';
}
