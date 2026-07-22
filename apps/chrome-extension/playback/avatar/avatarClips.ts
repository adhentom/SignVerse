import type { AvatarClip } from './AvatarAnimationEngine';

// Only clips reviewed as animation assets belong here. Generic motion is never mapped to an ISL gloss.
const CLIPS = new Map<string, AvatarClip>();
const LOADING = new Map<string, Promise<AvatarClip>>();

export function lookupAvatarClip(id: unknown): AvatarClip | undefined {
  return typeof id === 'string' ? CLIPS.get(id) : undefined;
}

export function registerAvatarClip(clip: AvatarClip): () => void {
  CLIPS.set(clip.id, clip);
  return () => CLIPS.delete(clip.id);
}

export function hasAvatarClipSource(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function clipUrl(source: string): string {
  if (/^https?:\/\//u.test(source)) return source;
  return typeof chrome === 'undefined' ? source : chrome.runtime.getURL(source);
}

function isPose(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).every((pose) => pose && typeof pose === 'object' &&
    Object.values(pose).every((number) => typeof number === 'number' && Number.isFinite(number)));
}

function isRig(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const rig = value as Record<string, unknown>;
  return typeof rig.name === 'string' && typeof rig.version === 'string' &&
    rig.coordinate_space === 'joint-local-degrees' &&
    (rig.solver === 'fixed-length-two-bone-ik' || rig.solver === 'source-direction-fixed-length');
}

export function parseAvatarClip(value: unknown): AvatarClip {
  if (!value || typeof value !== 'object') throw new Error('Animation clip is not a JSON object.');
  const candidate = value as Partial<AvatarClip>;
  if (typeof candidate.id !== 'string' || !candidate.id ||
      typeof candidate.duration !== 'number' || !Number.isFinite(candidate.duration) || candidate.duration <= 0 ||
      !Array.isArray(candidate.keyframes) || candidate.keyframes.length < 2) {
    throw new Error('Animation clip metadata is invalid.');
  }
  if (candidate.rig !== undefined && !isRig(candidate.rig)) {
    throw new Error('Animation clip rig metadata is invalid.');
  }
  let previous = -1;
  for (const frame of candidate.keyframes) {
    if (!frame || typeof frame.offset !== 'number' || frame.offset < previous ||
        frame.offset < 0 || frame.offset > 1 || !isPose(frame.pose)) {
      throw new Error('Animation clip keyframes are invalid.');
    }
    previous = frame.offset;
  }
  return candidate as AvatarClip;
}

export function loadAvatarClip(source: unknown, request: typeof fetch = fetch): Promise<AvatarClip> {
  if (!hasAvatarClipSource(source)) return Promise.reject(new Error('No validated avatar clip is registered.'));
  const registered = lookupAvatarClip(source);
  if (registered) return Promise.resolve(registered);
  const cached = LOADING.get(source);
  if (cached) return cached;
  const loading = request(clipUrl(source))
    .then(async (response) => {
      if (!response.ok) throw new Error('Animation clip could not be loaded.');
      return parseAvatarClip(await response.json());
    })
    .catch((error) => {
      LOADING.delete(source);
      throw error;
    });
  LOADING.set(source, loading);
  return loading;
}
