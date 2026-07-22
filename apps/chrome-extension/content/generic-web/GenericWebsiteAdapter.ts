import type { PlatformInfo } from '../../shared/platform';
import { SemanticContentAdapter } from '../adapters/SemanticContentAdapter';
import type { WebsiteReadingContext } from '../adapters/PlatformAdapter';
import {
  extractReadingContext,
  resolveReadingBlock,
} from './extraction/extractReadingContext';

export class GenericWebsiteAdapter extends SemanticContentAdapter {
  readonly platform: PlatformInfo = {
    id: 'website',
    displayName: 'Generic website',
    modeLabel: 'Website Mode',
    statusLabel: 'Website Reading',
  };

  matches(): boolean {
    return true;
  }

  extractReadingContext(context: WebsiteReadingContext) {
    return extractReadingContext(context);
  }

  resolveReadingBlock(context: WebsiteReadingContext): HTMLElement | null {
    return resolveReadingBlock(context);
  }
}
