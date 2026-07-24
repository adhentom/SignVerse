import { describe, expect, it } from 'vitest';
import { getBackendConfig } from '../../config/backendConfig';
import { createManifest, getBackendHostPermissions } from '../../manifest.config';

describe('backend configuration', () => {
  it('reads and normalizes environment-specific settings', () => {
    expect(getBackendConfig({
      VITE_SIGNVERSE_BACKEND_URL: 'https://api.signverse.test/',
      VITE_SIGNVERSE_BACKEND_TIMEOUT_MS: '2500',
    })).toEqual({ baseUrl: 'https://api.signverse.test', timeoutMs: 2_500 });
  });

  it('leaves unconfigured builds network-disabled', () => {
    expect(getBackendConfig({})).toEqual({ baseUrl: '', timeoutMs: 10_000 });
    expect(createManifest().host_permissions).toEqual([]);
  });

  it('scopes manifest host access to the configured backend origin', () => {
    expect(getBackendHostPermissions('https://api.signverse.test/v1')).toEqual([
      'https://api.signverse.test/*',
    ]);
  });

  it('exposes packaged sign media to the content-script renderer', () => {
    expect(createManifest('https://api.signverse.test').web_accessible_resources)
      .toEqual([{
        resources: ['animations/*', 'avatar/*', 'signs/*'],
        matches: ['http://*/*', 'https://*/*'],
      }]);
  });

  it('grants tab audio capture for automatic caption fallback', () => {
    expect(createManifest('https://api.signverse.test').permissions).toEqual(
      expect.arrayContaining(['activeTab', 'offscreen', 'storage', 'tabCapture']),
    );
  });

  it('rejects unsafe backend URL schemes', () => {
    expect(() => getBackendConfig({ VITE_SIGNVERSE_BACKEND_URL: 'file:///tmp/api' })).toThrow();
    expect(() => getBackendHostPermissions('ws://api.signverse.test')).toThrow();
  });
});
