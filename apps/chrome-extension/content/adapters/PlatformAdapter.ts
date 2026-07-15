import type { PlatformInfo } from '../../shared/platform';
import type { LiveContentSession } from '../../shared/liveContent';
import type { WebsiteContent } from '../../shared/websiteContent';

export interface PlatformAdapter {
  readonly platform: PlatformInfo;
  matches(url: URL): boolean;
  extractContent(root?: ParentNode): WebsiteContent;
}

export interface LiveContentAdapter<TMetadata extends object = Record<string, unknown>>
  extends PlatformAdapter {
  createLiveSession(context?: {
    document: Document;
    window: Window & typeof globalThis;
  }): LiveContentSession<TMetadata>;
}

export function supportsLiveContent(
  adapter: PlatformAdapter,
): adapter is LiveContentAdapter {
  return 'createLiveSession' in adapter && typeof adapter.createLiveSession === 'function';
}
