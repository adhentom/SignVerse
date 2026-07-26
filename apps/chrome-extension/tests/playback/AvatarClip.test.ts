import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar2DAdapter } from '../../playback/adapters/Avatar2DAdapter';
import { AvatarAnimationEngine } from '../../playback/avatar/AvatarAnimationEngine';
import { parseAvatarClip } from '../../playback/avatar/avatarClips';
import { createSignVerseInterpreterSvg } from '../../playback/avatar/signVerseInterpreter/createSignVerseInterpreterSvg';
import { SignVerseSkeletalRig } from '../../playback/avatar/signVerseInterpreter/SignVerseSkeletalRig';
import { signVerseHandShapePose } from '../../playback/avatar/signVerseInterpreter/handShapeLibrary';
import {
  SIGNVERSE_INTERPRETER_GEOMETRY,
  SIGNVERSE_INTERPRETER_RIG_VERSION,
} from '../../playback/avatar/signVerseInterpreter/interpreterGeometry';
import type { SignAsset } from '../../playback/types';
import { AVATAR_PROFILES } from '../../playback/avatarProfiles';

const clip = {
  schema: 'signverse.animation-clip',
  schema_version: '1.0',
  id: 'hello-landmarks-v1',
  duration: 1,
  rig: {
    name: 'signverse-hierarchical-svg', version: '2.0',
    coordinate_space: 'joint-local-degrees', solver: 'fixed-length-two-bone-ik',
  },
  keyframes: [
    { offset: 0, pose: { 'left-hand': { rotation: 0 } } },
    { offset: 1, pose: { 'left-hand': { rotation: 30 } } },
  ],
};

const videoAsset: SignAsset = {
  asset_id: 'hello', token_id: 'greeting-hello', canonical_gloss: 'HELLO', word: 'hello',
  synonyms: [], language: 'ISL', category: 'greetings', display_name: 'Hello', format: 'mp4',
  file_path: 'signs/hello.mp4', source: 'signs/hello.mp4', duration: 1, license: 'validated',
  version: '1', review_status: 'approved', transition: 'cut', handshape: 'source-derived',
  native_review: {
    status: 'approved', reviewer: 'Test ISL reviewer', reviewed_at: '2026-07-21', notes: 'Fixture approval.',
  },
  orientation: 'source-derived', facial_expression: 'source-derived', fallback: 'neutral-explanation',
  metadata: { avatar_clip: 'animations/hello.json' },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('landmark avatar clips', () => {
  it('validates ordered source-derived animation keyframes', () => {
    expect(parseAvatarClip(clip)).toMatchObject({ id: 'hello-landmarks-v1', duration: 1 });
    expect(() => parseAvatarClip({ ...clip, keyframes: [
      { offset: 0.8, pose: {} }, { offset: 0.2, pose: {} },
    ] })).toThrow('keyframes');
    expect(() => parseAvatarClip({ ...clip, rig: { version: 'broken' } }))
      .toThrow('rig metadata');
  });

  it('loads a generated clip and mounts the SVG skeleton', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(clip), { status: 200 }),
    );
    const target = document.createElement('div');
    const adapter = new Avatar2DAdapter(request);

    await adapter.mount(target, {
      metadata: videoAsset,
      data: new Blob([new Uint8Array([1])]),
    }, false);

    expect(request).toHaveBeenCalledWith('animations/hello.json');
    expect(target.querySelector('[data-avatar-part="left-hand"]')).not.toBeNull();
    adapter.destroy();
  });

  it('never replaces the branded interpreter with a dataset signer video', async () => {
    const target = document.createElement('div');
    const adapter = new Avatar2DAdapter(
      vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })),
    );
    await expect(adapter.mount(target, {
      metadata: { ...videoAsset, metadata: { avatar_clip: 'animations/missing.json' } },
      data: new Blob([new Uint8Array([1])], { type: 'video/mp4' }),
    }, false)).rejects.toThrow('Animation clip could not be loaded');

    expect(target.querySelector('video')).toBeNull();
    adapter.destroy();
  });

  it('interpolates projected shoulder rotations continuously across the angle boundary', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const svg = createSignVerseInterpreterSvg();
    const engine = new AvatarAnimationEngine(svg, {
      id: 'constraint-test', duration: 1,
      keyframes: [
        { offset: 0, pose: { 'left-upper-arm': { rotation: 170 } } },
        { offset: 1, pose: { 'left-upper-arm': { rotation: -170 } } },
      ],
    });

    engine.seek(0.5);

    const rotation = Number(svg.querySelector<SVGGElement>('[data-avatar-part="left-upper-arm"]')
      ?.getAttribute('transform')?.match(/rotate\(([-\d.]+)/u)?.[1]);
    expect(rotation).toBe(180);
    engine.seek(1);
    expect(svg.querySelector<SVGGElement>('[data-avatar-part="left-upper-arm"]')
      ?.getAttribute('transform')).toBe('rotate(190)');
    engine.dispose();
  });

  it('never overlays idle hand motion on a governed sign clip', () => {
    const svg = createSignVerseInterpreterSvg();
    const engine = new AvatarAnimationEngine(svg, {
      id: 'governed-hand-pose',
      duration: 1,
      keyframes: [
        {
          offset: 0,
          pose: {
            'right-upper-arm': { rotation: 38 },
            'right-forearm': { rotation: -76 },
            'right-hand': { rotation: -15, scaleY: 0.84 },
          },
        },
        {
          offset: 1,
          pose: {
            'right-upper-arm': { rotation: 38 },
            'right-forearm': { rotation: -76 },
            'right-hand': { rotation: -15, scaleY: 0.84 },
          },
        },
      ],
    });

    engine.seek(0.5);

    expect(svg.querySelector('[data-avatar-part="right-upper-arm"]')?.getAttribute('transform'))
      .toBe('rotate(38)');
    expect(svg.querySelector('[data-avatar-part="right-forearm"]')?.getAttribute('transform'))
      .toBe('rotate(-76)');
    expect(svg.querySelector('[data-avatar-part="right-hand"]')?.getAttribute('transform'))
      .toBe('rotate(-15)');
    expect(svg.querySelector('[data-avatar-hand-artwork="right"]')?.getAttribute('transform'))
      .toBe('scale(1 0.84)');
    engine.dispose();
  });

  it('ignores per-bone translation and scaling so clips cannot detach limbs', () => {
    const svg = createSignVerseInterpreterSvg();
    const engine = new AvatarAnimationEngine(svg, {
      id: 'unsafe-transform-test', duration: 1,
      keyframes: [
        { offset: 0, pose: {
          'left-upper-arm': { x: 900, y: -700, rotation: 20, scaleX: 4, scaleY: 0.1 },
          'left-forearm': { x: -500, y: 600, rotation: 35 },
        } },
        { offset: 1, pose: {
          'left-upper-arm': { x: -900, y: 700, rotation: 40 },
          'left-forearm': { x: 500, y: -600, rotation: 55 },
        } },
      ],
    });

    engine.seek(0.5);

    expect(svg.querySelector('[data-avatar-part="left-upper-arm"]')?.getAttribute('transform'))
      .toMatch(/^rotate\([-\d.]+\)$/u);
    expect(svg.querySelector('[data-avatar-part="left-forearm"]')?.getAttribute('transform'))
      .toMatch(/^rotate\([-\d.]+\)$/u);
    expect(svg.querySelector('[data-avatar-anchor="left-elbow"]')?.getAttribute('transform'))
      .toBe(`translate(${SIGNVERSE_INTERPRETER_GEOMETRY.upperArmLength} 0)`);
    expect(svg.querySelector('[data-avatar-anchor="left-wrist"]')?.getAttribute('transform'))
      .toBe(`translate(${SIGNVERSE_INTERPRETER_GEOMETRY.forearmLength} 0)`);
    engine.dispose();
  });

  it('preserves fixed arm lengths under constrained joint interpolation', () => {
    const rig = new SignVerseSkeletalRig(createSignVerseInterpreterSvg());
    rig.applyPose({
      'right-upper-arm': { rotation: -400 },
      'right-forearm': { rotation: 500 },
      'right-hand': { rotation: 250 },
    }, 0.5);
    const { shoulder, elbow, wrist } = rig.armChain('right');

    expect(Math.hypot(elbow[0] - shoulder[0], elbow[1] - shoulder[1]))
      .toBeCloseTo(SIGNVERSE_INTERPRETER_GEOMETRY.upperArmLength, 8);
    expect(Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]))
      .toBeCloseTo(SIGNVERSE_INTERPRETER_GEOMETRY.forearmLength, 8);
  });

  it('allows a raised arm to cross the image angle boundary without pinning', () => {
    const rig = new SignVerseSkeletalRig(createSignVerseInterpreterSvg());
    rig.applyPose({ 'left-upper-arm': { rotation: 190 } });

    expect(rig.snapshotPose()['left-upper-arm']?.rotation).toBe(190);
    expect(rig.armChain('left').elbow[1]).toBeLessThan(SIGNVERSE_INTERPRETER_GEOMETRY.shoulders.left[1]);
  });

  it('uses anatomically positioned pivots and a strict local parent-child hierarchy', () => {
    const svg = createSignVerseInterpreterSvg();
    expect(svg.getAttribute('viewBox')).toBe(SIGNVERSE_INTERPRETER_GEOMETRY.viewBox);
    expect(svg.dataset.rigVersion).toBe(SIGNVERSE_INTERPRETER_RIG_VERSION);
    expect(svg.dataset.avatarDesign).toBe('signverse-female-v1');
    expect(svg.querySelector('[data-avatar-anchor="left-shoulder"]')?.getAttribute('transform'))
      .toBe(`translate(${-SIGNVERSE_INTERPRETER_GEOMETRY.clavicleLength} 0)`);
    expect(svg.querySelector('[data-avatar-anchor="right-shoulder"]')?.getAttribute('transform'))
      .toBe(`translate(${SIGNVERSE_INTERPRETER_GEOMETRY.clavicleLength} 0)`);
    expect(svg.querySelector('[data-avatar-anchor="neck-base"]')?.getAttribute('transform'))
      .toBe('translate(300 220)');
    expect(svg.querySelector('[data-avatar-anchor="left-hip"]')).not.toBeNull();
    expect(svg.querySelector('[data-avatar-anchor="right-hip"]')).not.toBeNull();

    for (const side of ['left', 'right'] as const) {
      const upper = svg.querySelector(`[data-avatar-part="${side}-upper-arm"]`)!;
      const forearm = svg.querySelector(`[data-avatar-part="${side}-forearm"]`)!;
      const hand = svg.querySelector(`[data-avatar-part="${side}-hand"]`)!;
      const clavicle = svg.querySelector(`[data-avatar-part="${side}-clavicle"]`)!;
      expect(clavicle.contains(upper)).toBe(true);
      expect(upper.contains(forearm)).toBe(true);
      expect(forearm.contains(hand)).toBe(true);
      for (const finger of ['thumb', 'index', 'middle', 'ring', 'little']) {
        const mcp = svg.querySelector(`[data-avatar-part="${side}-${finger}-mcp"]`)!;
        const pip = svg.querySelector(`[data-avatar-part="${side}-${finger}-pip"]`)!;
        const dip = svg.querySelector(`[data-avatar-part="${side}-${finger}-dip"]`)!;
        expect(mcp.contains(pip)).toBe(true);
        expect(pip.contains(dip)).toBe(true);
      }
      const thumbCmc = svg.querySelector(`[data-avatar-part="${side}-thumb-cmc"]`)!;
      const thumbMcp = svg.querySelector(`[data-avatar-part="${side}-thumb-mcp"]`)!;
      expect(thumbCmc.contains(thumbMcp)).toBe(true);

      const thigh = svg.querySelector(`[data-avatar-part="${side}-thigh"]`)!;
      expect(svg.querySelector('[data-avatar-part="pelvis"]')?.contains(thigh)).toBe(true);
    }
  });

  it('rejects an SVG whose visual nodes do not follow the declared bone hierarchy', () => {
    const svg = createSignVerseInterpreterSvg();
    svg.querySelector('[data-avatar-part="left-forearm"]')?.remove();

    expect(() => new SignVerseSkeletalRig(svg)).toThrow(
      'SignVerse interpreter hierarchy is invalid at left-upper-arm -> left-forearm.',
    );
  });

  it('uses tapered anatomical hand artwork without changing the articulated bone anchors', () => {
    const svg = createSignVerseInterpreterSvg();

    expect(svg.querySelectorAll('[data-avatar-hand-style="anatomical-articulated-palm-v3"]')).toHaveLength(2);
    expect(svg.querySelector('[data-avatar-hand-artwork="left"]')?.getAttribute('transform'))
      .toBe('scale(1 -1)');
    expect(svg.querySelector('[data-avatar-hand-artwork="right"]')?.getAttribute('transform'))
      .toBe('scale(1 1)');
    expect(svg.querySelectorAll('.svi-cuff')).toHaveLength(2);
    expect(svg.querySelectorAll('.svi-cuff-trim')).toHaveLength(2);
    expect(svg.querySelectorAll('.svi-phalanx')).toHaveLength(32);
    expect(svg.querySelectorAll('[data-avatar-finger-anatomy="tapered-human-v1"]')).toHaveLength(32);
    expect(svg.querySelectorAll('[data-avatar-palm-artwork]')).toHaveLength(2);
    expect(svg.querySelectorAll('.svi-thenar')).toHaveLength(0);
    expect(svg.querySelectorAll('.svi-wrist-bridge')).toHaveLength(0);
    expect(svg.querySelectorAll('.svi-finger')).toHaveLength(0);

    const proximalLengths = ['index', 'middle', 'ring', 'little'].map((finger) => (
      svg.querySelector(`[data-avatar-anchor="left-${finger}-pip"]`)?.getAttribute('transform')
    ));
    expect(proximalLengths).toEqual([
      'translate(19 0)', 'translate(21 0)', 'translate(19.5 0)', 'translate(15 0)',
    ]);
    const middleLengths = ['index', 'middle', 'ring', 'little'].map((finger) => (
      svg.querySelector(`[data-avatar-anchor="left-${finger}-dip"]`)?.getAttribute('transform')
    ));
    expect(middleLengths).toEqual([
      'translate(13.5 0)', 'translate(14.5 0)', 'translate(13.5 0)', 'translate(10.5 0)',
    ]);
    const palm = svg.querySelector('[data-avatar-palm-artwork="left"]');
    expect(palm?.getAttribute('width')).toBe('58');
    expect(palm?.getAttribute('height')).toBe('52');
    new SignVerseSkeletalRig(svg);
    expect(svg.querySelector('[data-avatar-hand-artwork="left"]')?.getAttribute('transform'))
      .toBe('scale(1 -0.78)');
    expect(svg.querySelector('[data-avatar-hand-artwork="right"]')?.getAttribute('transform'))
      .toBe('scale(1 0.78)');
  });

  it('renders both professional interpreter skins on the identical anatomical rig', () => {
    const [female, male] = AVATAR_PROFILES.map((profile) => createSignVerseInterpreterSvg(profile));

    expect(female.dataset.avatarDesign).toBe('signverse-female-v1');
    expect(male.dataset.avatarDesign).toBe('signverse-male-v1');
    expect(female.dataset.rigVersion).toBe(male.dataset.rigVersion);
    expect(female.dataset.avatarProfile).toBe('adult-female');
    expect(male.dataset.avatarProfile).toBe('adult-male');
    const femaleTorso = female.querySelector('[data-avatar-costume="adult-female-professional-attire"]')?.getAttribute('href');
    const maleTorso = male.querySelector('[data-avatar-costume="adult-male-professional-attire"]')?.getAttribute('href');
    const femaleHead = female.querySelector('[data-avatar-hairstyle="adult-female-professional"]')?.getAttribute('href');
    const maleHead = male.querySelector('[data-avatar-hairstyle="adult-male-professional"]')?.getAttribute('href');
    expect(femaleTorso).toContain('cartoon%20girl');
    expect(maleTorso).toContain('cartoon%20boy');
    expect(femaleTorso).not.toBe(maleTorso);
    expect(femaleHead).toContain('cartoon%20girl');
    expect(maleHead).toContain('cartoon%20boy');
    expect(femaleHead).not.toBe(maleHead);
    for (const svg of [female, male]) {
      expect(svg.querySelectorAll('.svi-illustrated-bone--upper image')).toHaveLength(2);
      expect(svg.querySelectorAll('.svi-illustrated-bone--forearm image')).toHaveLength(2);
      expect(svg.querySelectorAll('[data-avatar-attachment$="-shoulder"]')).toHaveLength(2);
      expect(svg.querySelectorAll('.svi-upper-arm')).toHaveLength(2);
      expect(svg.querySelectorAll('.svi-forearm')).toHaveLength(4);
      expect(svg.querySelectorAll('.svi-phalanx')).toHaveLength(32);
      expect(() => new SignVerseSkeletalRig(svg)).not.toThrow();
    }
  });

  it('blends from the previous sign pose and applies question non-manual markers', () => {
    const svg = createSignVerseInterpreterSvg();
    const engine = new AvatarAnimationEngine(svg, clip);
    engine.setTransitionSource({ 'left-hand': { rotation: -30 } });
    engine.setNonManualMarkers([{
      marker: 'brow-raise', value: 'yes-no-question', scope: 'phrase',
      timing: 'throughout', intensity: 1,
    }]);

    engine.seek(0);
    expect(svg.querySelector('[data-avatar-part="left-hand"]')?.getAttribute('transform'))
      .toBe('rotate(-30)');
    expect(svg.querySelector('[data-avatar-part="eyebrows"]')?.getAttribute('transform'))
      .toContain('translate(0 -93)');
    expect(svg.querySelector('[data-avatar-mouth="neutral"]')?.getAttribute('style'))
      .toContain('opacity: 1');
    engine.dispose();
  });

  it('provides reusable articulated hand shapes without changing the clip contract', () => {
    const fist = signVerseHandShapePose('left', 'fist');
    const point = signVerseHandShapePose('right', 'point');
    const pinch = signVerseHandShapePose('left', 'pinch');
    const thumbUp = signVerseHandShapePose('right', 'thumb-up');

    expect(fist['left-index-pip']?.rotation).toBe(104);
    expect(fist['left-index-dip']?.rotation).toBe(76);
    expect(fist['left-thumb-cmc']?.rotation).toBe(-10);
    expect(point['right-index-pip']?.rotation).toBe(2);
    expect(point['right-middle-pip']?.rotation).toBe(106);
    expect(pinch['left-thumb-cmc']?.rotation).toBe(-50);
    expect(pinch['left-index-mcp']?.rotation).toBe(30);
    expect(thumbUp['right-thumb-cmc']?.rotation).toBe(105);
    expect(thumbUp['right-thumb-mcp']?.rotation).toBe(5);
  });

  it('constrains noisy source-derived rotations to human joint ranges', () => {
    const svg = createSignVerseInterpreterSvg();
    const engine = new AvatarAnimationEngine(svg, {
      id: 'turned-palm', duration: 1,
      keyframes: [
        { offset: 0, pose: {
          'right-thumb-cmc': { rotation: -72 },
          'right-index-pip': { rotation: -68 },
          'right-index-dip': { rotation: -43 },
        } },
        { offset: 1, pose: {
          'right-thumb-cmc': { rotation: -72 },
          'right-index-pip': { rotation: -68 },
          'right-index-dip': { rotation: -43 },
        } },
      ],
    });

    engine.seek(1);

    expect(svg.querySelector('[data-avatar-part="right-thumb-cmc"]')?.getAttribute('transform'))
      .toBe('rotate(-65)');
    expect(svg.querySelector('[data-avatar-part="right-index-pip"]')?.getAttribute('transform'))
      .toBe('rotate(-8)');
    expect(svg.querySelector('[data-avatar-part="right-index-dip"]')?.getAttribute('transform'))
      .toBe('rotate(-12)');
    engine.dispose();
  });

  it('renders smooth blinking, gaze, and semantic facial expression controls', () => {
    const svg = createSignVerseInterpreterSvg();
    const rig = new SignVerseSkeletalRig(svg);

    rig.setBlink(0.25);
    rig.setGaze(-3, 2);
    rig.setFacialExpression('surprise');

    expect(svg.querySelector('[data-avatar-control="left-eye-lid"]')?.getAttribute('transform'))
      .toContain('scale(1 0.25)');
    expect(svg.querySelector('[data-avatar-control="right-pupil"]')?.getAttribute('transform'))
      .toBe('translate(-3 2)');
    expect(svg.querySelector('[data-avatar-mouth="open"]')?.getAttribute('style'))
      .toContain('opacity: 1');
  });
});
