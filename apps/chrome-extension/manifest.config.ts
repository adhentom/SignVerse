export function getBackendHostPermissions(backendUrl: string | undefined): string[] {
  if (!backendUrl?.trim()) {
    return [];
  }

  const url = new URL(backendUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VITE_SIGNVERSE_BACKEND_URL must use HTTP or HTTPS.');
  }

  return [`${url.origin}/*`];
}

export function createManifest(backendUrl?: string) {
  return {
    manifest_version: 3,
    name: 'SignVerse AI',
    version: '0.1.0',
    description: 'Accessible website and live-caption interpretation through SignVerse AI.',
    permissions: ['activeTab'],
    host_permissions: getBackendHostPermissions(backendUrl),
    action: {
      default_popup: 'popup.html',
      default_title: 'Open SignVerse AI',
    },
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    content_scripts: [
      {
        matches: ['http://*/*', 'https://*/*'],
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ],
  };
}
