import type { PlatformInfo } from '../../shared/platform';
import { SemanticContentAdapter } from '../adapters/SemanticContentAdapter';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtu.be']);

export class YouTubeAdapter extends SemanticContentAdapter {
  readonly platform: PlatformInfo = {
    id: 'youtube',
    displayName: 'YouTube',
    modeLabel: 'YouTube Mode',
    statusLabel: 'YouTube Interpretation',
  };

  matches(url: URL): boolean {
    const hostname = url.hostname.toLocaleLowerCase();
    return (
      YOUTUBE_HOSTS.has(hostname) ||
      hostname.endsWith('.youtube.com')
    );
  }
}
