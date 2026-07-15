import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light';
import type { LoadedAsset, Renderer } from '../types';

export class LottieAdapter implements Renderer {
  readonly format = 'lottie' as const;
  private animation?: AnimationItem;

  async mount(target: HTMLElement, asset: LoadedAsset, reducedMotion: boolean): Promise<void> {
    this.destroy();
    this.animation = lottie.loadAnimation({
      animationData: structuredClone(asset.data) as object,
      autoplay: false,
      container: target,
      loop: false,
      renderer: 'svg',
      rendererSettings: { progressiveLoad: true },
    });
    await new Promise<void>((resolve, reject) => {
      const loaded = () => {
        cleanup();
        if (reducedMotion) this.animation?.goToAndStop(this.animation.totalFrames - 1, true);
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error('The Lottie animation could not be rendered.'));
      };
      const cleanup = () => {
        this.animation?.removeEventListener('DOMLoaded', loaded);
        this.animation?.removeEventListener('data_failed', failed);
      };
      this.animation?.addEventListener('DOMLoaded', loaded);
      this.animation?.addEventListener('data_failed', failed);
    });
  }

  play(speed: number): void {
    this.animation?.setSpeed(speed);
    this.animation?.play();
  }

  pause(): void {
    this.animation?.pause();
  }

  seek(progress: number): void {
    if (!this.animation) return;
    this.animation.goToAndStop(Math.max(0, Math.min(1, progress)) * this.animation.totalFrames, true);
  }

  destroy(): void {
    this.animation?.destroy();
    this.animation = undefined;
  }
}
