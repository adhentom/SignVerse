import type { LoadedAsset, Renderer } from '../types';

interface SvgSequenceData {
  frames: string[];
}

export class SvgSequenceAdapter implements Renderer {
  readonly format = 'svg-sequence' as const;
  private image?: HTMLImageElement;
  private frames: string[] = [];

  async mount(target: HTMLElement, asset: LoadedAsset, reducedMotion: boolean): Promise<void> {
    this.destroy();
    const data = asset.data as Partial<SvgSequenceData>;
    if (!Array.isArray(data.frames) || !data.frames.every((frame) => typeof frame === 'string')) {
      throw new Error('The SVG sequence is corrupted.');
    }
    this.frames = data.frames;
    this.image = document.createElement('img');
    this.image.alt = '';
    this.image.src = this.frames[reducedMotion ? this.frames.length - 1 : 0] ?? '';
    target.append(this.image);
  }

  play(): void {}
  pause(): void {}

  seek(progress: number): void {
    if (!this.image || this.frames.length === 0) return;
    const index = Math.min(this.frames.length - 1, Math.floor(progress * this.frames.length));
    this.image.src = this.frames[index];
  }

  destroy(): void {
    this.image?.remove();
    this.image = undefined;
    this.frames = [];
  }
}
