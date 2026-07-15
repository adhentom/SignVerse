import type { PlatformInfo } from '../../shared/platform';
import type { WebsiteContent } from '../../shared/websiteContent';
import { extractWebsiteContent } from '../generic-web/extraction/extractWebsiteContent';
import type { PlatformAdapter } from './PlatformAdapter';

export abstract class SemanticContentAdapter implements PlatformAdapter {
  abstract readonly platform: PlatformInfo;

  abstract matches(url: URL): boolean;

  extractContent(root: ParentNode = document): WebsiteContent {
    return extractWebsiteContent(root);
  }
}
