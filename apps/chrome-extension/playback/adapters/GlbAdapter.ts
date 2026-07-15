import type { LoadedAsset, Renderer } from '../types';

export class GlbAdapter implements Renderer {
  readonly format = 'glb' as const;

  async mount(_target: HTMLElement, _asset: LoadedAsset): Promise<void> {
    throw new Error('GLB rendering is not enabled in this build.');
  }

  play(): void {}
  pause(): void {}
  seek(): void {}
  destroy(): void {}
}
