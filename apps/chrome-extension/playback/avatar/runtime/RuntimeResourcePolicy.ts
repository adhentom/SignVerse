export type AvatarResourceMode = 'standard' | 'reduced';

export interface AvatarRuntimePolicy {
  readonly mode: AvatarResourceMode;
  readonly inactiveFrameIntervalMs: number;
  readonly secondaryMotionScale: number;
  readonly genericAssetCacheCapacity: number;
  readonly preloadConcurrency: number;
}

const POLICIES: Readonly<Record<AvatarResourceMode, AvatarRuntimePolicy>> = Object.freeze({
  standard: Object.freeze({
    mode: 'standard',
    inactiveFrameIntervalMs: 0,
    secondaryMotionScale: 1,
    genericAssetCacheCapacity: 64,
    preloadConcurrency: 2,
  }),
  reduced: Object.freeze({
    mode: 'reduced',
    inactiveFrameIntervalMs: 1000 / 15,
    secondaryMotionScale: 0.4,
    genericAssetCacheCapacity: 16,
    preloadConcurrency: 1,
  }),
});

export class RuntimeResourcePolicy {
  private selected: AvatarResourceMode = 'standard';

  setMode(mode: AvatarResourceMode): void {
    this.selected = mode;
  }

  get mode(): AvatarResourceMode {
    return this.selected;
  }

  get current(): AvatarRuntimePolicy {
    return POLICIES[this.selected];
  }
}

export const avatarRuntimeResourcePolicy = new RuntimeResourcePolicy();

export function configureAvatarResourceMode(mode: AvatarResourceMode): void {
  avatarRuntimeResourcePolicy.setMode(mode);
}
