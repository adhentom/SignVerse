import type { PlatformInfo } from '../../shared/platform';
import { SemanticContentAdapter } from '../adapters/SemanticContentAdapter';

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
}
