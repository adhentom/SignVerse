import type { PlatformInfo } from '../../shared/platform';
import type { GoogleMeetPacketMetadata } from '../../shared/googleMeet';
import type { LiveContentAdapter } from '../adapters/PlatformAdapter';
import { SemanticContentAdapter } from '../adapters/SemanticContentAdapter';
import { GoogleMeetCaptionSession } from './GoogleMeetCaptionSession';

export class GoogleMeetAdapter extends SemanticContentAdapter implements LiveContentAdapter<GoogleMeetPacketMetadata> {
  readonly platform: PlatformInfo = {
    id: 'google-meet',
    displayName: 'Google Meet',
    modeLabel: 'Google Meet Mode',
    statusLabel: 'Google Meet Live',
  };

  matches(url: URL): boolean {
    return url.hostname.toLowerCase() === 'meet.google.com';
  }

  createLiveSession(context = { document, window }): GoogleMeetCaptionSession {
    return new GoogleMeetCaptionSession(context.document, context.window);
  }
}
