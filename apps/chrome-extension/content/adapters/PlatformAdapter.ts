import type { PlatformInfo } from '../../shared/platform';
import type { WebsiteContent } from '../../shared/websiteContent';

export interface PlatformAdapter {
  readonly platform: PlatformInfo;
  matches(url: URL): boolean;
  extractContent(root?: ParentNode): WebsiteContent;
}
