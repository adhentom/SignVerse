import type { PlatformInfo } from '../../shared/platform';
import type { YouTubePacketMetadata } from '../../shared/youtube';
import type { LiveContentAdapter } from '../adapters/PlatformAdapter';
import { SemanticContentAdapter } from '../adapters/SemanticContentAdapter';
import { YouTubeCaptionSession } from './YouTubeCaptionSession';
import { isYouTubeHost } from './youtubeUtils';

export class YouTubeAdapter
  extends SemanticContentAdapter
  implements LiveContentAdapter<YouTubePacketMetadata>
{
  readonly platform: PlatformInfo = {
    id: 'youtube',
    displayName: 'YouTube',
    modeLabel: 'YouTube Mode',
    statusLabel: 'YouTube Interpretation',
  };

  matches(url: URL): boolean {
    return isYouTubeHost(url.hostname);
  }

  createLiveSession(
    context = { document, window },
  ): YouTubeCaptionSession {
    return new YouTubeCaptionSession(context.document, context.window);
  }
}
