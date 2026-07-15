import type { PlatformInfo } from '../../shared/platform';
import { SemanticContentAdapter } from '../adapters/SemanticContentAdapter';

export class GoogleMeetAdapter extends SemanticContentAdapter {
  readonly platform: PlatformInfo = {
    id: 'google-meet',
    displayName: 'Google Meet',
    modeLabel: 'Google Meet Mode',
    statusLabel: 'Google Meet Live',
  };

  matches(url: URL): boolean {
    return url.hostname.toLocaleLowerCase() === 'meet.google.com';
  }
}
