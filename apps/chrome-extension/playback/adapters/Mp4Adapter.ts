import type { LoadedAsset, Renderer } from '../types';

export class Mp4Adapter implements Renderer {
  readonly format = 'mp4' as const;
  private video?: HTMLVideoElement;
  private objectUrl?: string;

  async mount(target: HTMLElement, asset: LoadedAsset, reducedMotion: boolean): Promise<void> {
    this.destroy();
    if (!(asset.data instanceof Blob) || asset.data.size === 0) {
      throw new Error('The sign video asset is corrupted.');
    }
    this.objectUrl = URL.createObjectURL(asset.data);
    this.video = document.createElement('video');
    this.video.src = this.objectUrl;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.loop = false;
    this.video.disablePictureInPicture = true;
    this.video.controls = false;
    this.video.setAttribute('aria-hidden', 'true');
    target.append(this.video);
    if (this.video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        this.video?.addEventListener('loadedmetadata', () => resolve(), { once: true });
        this.video?.addEventListener('error', () => reject(new Error('The sign video could not be decoded.')), { once: true });
      });
    }
    if (reducedMotion) this.video.currentTime = 0;
  }

  play(speed: number): void {
    if (!this.video) return;
    this.video.playbackRate = speed;
    void this.video.play().catch(() => undefined);
  }

  pause(): void {
    this.video?.pause();
  }

  seek(progress: number): void {
    if (!this.video || !Number.isFinite(this.video.duration)) return;
    this.video.currentTime = Math.max(0, Math.min(1, progress)) * this.video.duration;
  }

  destroy(): void {
    this.video?.pause();
    this.video?.remove();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.video = undefined;
    this.objectUrl = undefined;
  }
}
