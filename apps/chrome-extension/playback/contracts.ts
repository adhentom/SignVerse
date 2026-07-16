import type { LoadedAsset, SignAsset } from './types';

export interface GlossLibrary {
  resolve(gloss: string): string | undefined;
}

export interface AnimationRegistry {
  lookup(assetId: string): SignAsset | undefined;
  list(): readonly SignAsset[];
}

export interface MotionDatabase {
  load(asset: SignAsset): Promise<LoadedAsset>;
  preload(asset: SignAsset | undefined): void;
}

export interface SignerProfile {
  id: string;
  label: string;
  scale: number;
}

export interface AvatarRigController {
  setArmTarget(side: 'left' | 'right', target: readonly [number, number, number]): void;
  setFingerPose(side: 'left' | 'right', joints: Readonly<Record<string, number>>): void;
  setHeadTarget(target: readonly [number, number, number]): void;
  setEyeGaze(target: readonly [number, number, number]): void;
  setBlink(amount: number): void;
  setFacialExpression(name: string, weight: number): void;
  setMouthCue(name: string, weight: number): void;
  setBreathing(amount: number): void;
}
