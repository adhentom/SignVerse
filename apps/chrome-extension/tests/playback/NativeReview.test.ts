import { describe, expect, it } from 'vitest';
import animationAssets from '../../playback/animationAssets.json';
import { signAssetRegistry } from '../../playback/AssetRegistry';
import { isNativeApproved, nativeReviewFor } from '../../playback/nativeReview';
import { parseAvatarClip } from '../../playback/avatar/avatarClips';
import { createSignVerseInterpreterSvg } from '../../playback/avatar/signVerseInterpreter/createSignVerseInterpreterSvg';
import { SignVerseSkeletalRig } from '../../playback/avatar/signVerseInterpreter/SignVerseSkeletalRig';
import { SIGNVERSE_INTERPRETER_GEOMETRY } from '../../playback/avatar/signVerseInterpreter/interpreterGeometry';
import { AVATAR_PROFILES } from '../../playback/avatarProfiles';

const clipFiles = import.meta.glob('../../public/animations/*.json', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

describe('native ISL animation governance', () => {
  it('does not package permission-gated animation clips in the public release', () => {
    const clipIds = Object.keys(animationAssets);
    expect(clipIds).toEqual([]);
    expect(signAssetRegistry.list()).toEqual([]);
    for (const assetId of clipIds) {
      const asset = signAssetRegistry.lookup(assetId);
      expect(asset, assetId).toBeDefined();
      expect(asset?.native_review?.status, assetId).toMatch(/^(pending|approved|rejected)$/u);
      if (asset?.native_review?.status === 'approved') {
        expect(isNativeApproved(asset), assetId).toBe(true);
      }
    }
  });

  it('does not invent native approval when no reviewer record exists', () => {
    expect(nativeReviewFor('not-reviewed')).toEqual({
      status: 'pending',
      reviewer: '',
      reviewed_at: '',
      notes: 'Native ISL linguistic review has not been recorded.',
    });
  });

  it('parses every generated clip without non-finite joint values', () => {
    const registeredIds = new Set(Object.keys(animationAssets));
    const fileIds = new Set(Object.keys(clipFiles).map((path) => path.split('/').at(-1)!.replace('.json', '')));
    expect(fileIds).toEqual(registeredIds);

    for (const [path, raw] of Object.entries(clipFiles)) {
      const clip = parseAvatarClip(JSON.parse(raw));
      expect(clip.keyframes.length, path).toBeGreaterThan(1);
      for (const frame of clip.keyframes) {
        for (const pose of Object.values(frame.pose)) {
          for (const value of Object.values(pose ?? {})) {
            expect(Number.isFinite(value), path).toBe(true);
          }
        }
      }
    }
  }, 15_000);

  it('plays every generated clip on both avatar skins without detaching the arm chains', () => {
    for (const profile of AVATAR_PROFILES) {
      const svg = createSignVerseInterpreterSvg(profile);
      const rig = new SignVerseSkeletalRig(svg);
      for (const [path, raw] of Object.entries(clipFiles)) {
        const clip = parseAvatarClip(JSON.parse(raw));
        const checkpoints = [0, Math.floor(clip.keyframes.length / 2), clip.keyframes.length - 1];
        checkpoints.forEach((index) => {
          const frame = clip.keyframes[index];
          rig.applyPose(frame.pose);
          for (const side of ['left', 'right'] as const) {
            const { shoulder, elbow, wrist } = rig.armChain(side);
            expect(
              Math.hypot(elbow[0] - shoulder[0], elbow[1] - shoulder[1]),
              `${path} (${profile.id}, frame ${index}, ${side} upper arm)`,
            ).toBeCloseTo(SIGNVERSE_INTERPRETER_GEOMETRY.upperArmLength, 8);
            expect(
              Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]),
              `${path} (${profile.id}, frame ${index}, ${side} forearm)`,
            ).toBeCloseTo(SIGNVERSE_INTERPRETER_GEOMETRY.forearmLength, 8);
          }
        });
        for (const pose of Object.values(rig.snapshotPose())) {
          for (const value of Object.values(pose ?? {})) {
            expect(Number.isFinite(value), `${path} (${profile.id}, completion)`).toBe(true);
          }
        }
      }
      svg.remove();
    }
  }, 30_000);
});
