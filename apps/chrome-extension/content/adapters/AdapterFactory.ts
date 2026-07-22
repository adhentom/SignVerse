import { GenericWebsiteAdapter } from '../generic-web/GenericWebsiteAdapter';
import { GoogleMeetAdapter } from '../google-meet/GoogleMeetAdapter';
import { YouTubeAdapter } from '../youtube/YouTubeAdapter';
import type { PlatformAdapter } from './PlatformAdapter';

const DEFAULT_ADAPTERS: readonly PlatformAdapter[] = [
  new GoogleMeetAdapter(),
  new YouTubeAdapter(),
  new GenericWebsiteAdapter(),
];

export class AdapterFactory {
  constructor(private readonly adapters: readonly PlatformAdapter[] = DEFAULT_ADAPTERS) {
    if (adapters.length === 0) {
      throw new Error('AdapterFactory requires at least one platform adapter.');
    }
  }

  create(currentUrl: URL | string): PlatformAdapter {
    const url = typeof currentUrl === 'string' ? new URL(currentUrl) : currentUrl;
    const adapter = this.adapters.find((candidate) => candidate.matches(url));

    if (!adapter) {
      throw new Error(`No SignVerse adapter supports ${url.hostname}.`);
    }

    return adapter;
  }
}

export const adapterFactory = new AdapterFactory();
