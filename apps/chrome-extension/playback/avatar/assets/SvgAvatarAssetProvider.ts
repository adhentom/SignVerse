import { createSignVerseInterpreterSvg } from '../signVerseInterpreter/createSignVerseInterpreterSvg';
import type {
  AvatarAssetProvider,
  AvatarRendererManifestEntry,
  AvatarVisualLease,
} from './types';
import type { AvatarProfile } from '../../avatarProfiles';

export class SvgAvatarAssetProvider implements AvatarAssetProvider {
  readonly kind = 'svg' as const;
  private readonly active = new Set<SVGSVGElement>();

  supports(profile: AvatarProfile, renderer: AvatarRendererManifestEntry): boolean {
    return renderer.kind === this.kind &&
      renderer.rigId === profile.rigId &&
      renderer.profiles.includes(profile.id);
  }

  acquire(profile: AvatarProfile, renderer: AvatarRendererManifestEntry): AvatarVisualLease {
    const root = createSignVerseInterpreterSvg(profile);
    this.active.add(root);
    let released = false;
    return {
      asset: {
        kind: this.kind,
        profile: profile.id,
        rendererId: renderer.id,
        resource: root,
      },
      release: () => {
        if (released) return;
        released = true;
        this.active.delete(root);
        root.remove();
      },
    };
  }

  dispose(): void {
    for (const root of this.active) root.remove();
    this.active.clear();
  }
}
