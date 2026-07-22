import {
  SIGNVERSE_ARM_BIND_ROTATION,
  SIGNVERSE_INTERPRETER_GEOMETRY,
  SIGNVERSE_INTERPRETER_RIG_VERSION,
} from './interpreterGeometry';
import femaleHeadArtwork from '../../../../../assets/avatar/vector/profiles/adult-female/head.svg?url';
import femaleTorsoArtwork from '../../../../../assets/avatar/vector/profiles/adult-female/torso.svg?url';
import maleHeadArtwork from '../../../../../assets/avatar/vector/profiles/adult-male/head.svg?url';
import maleTorsoArtwork from '../../../../../assets/avatar/vector/profiles/adult-male/torso.svg?url';
import leftForearmArtwork from '../../../../../assets/avatar/vector/parts/left-forearm.svg?url';
import leftUpperArmArtwork from '../../../../../assets/avatar/vector/parts/left-upper-arm.svg?url';
import neckArtwork from '../../../../../assets/avatar/vector/parts/neck.svg?url';
import pelvisArtwork from '../../../../../assets/avatar/vector/parts/pelvis.svg?url';
import rightForearmArtwork from '../../../../../assets/avatar/vector/parts/right-forearm.svg?url';
import rightUpperArmArtwork from '../../../../../assets/avatar/vector/parts/right-upper-arm.svg?url';
import anatomicalPalmArtwork from '../../../../../assets/avatar/vector/parts/anatomical-palm.svg?url';
import { DEFAULT_AVATAR, type AvatarProfile } from '../../avatarProfiles';

type Side = 'left' | 'right';
type Finger = 'index' | 'middle' | 'ring' | 'little';

const COMMON_ARTWORK = {
  neck: neckArtwork,
  pelvis: pelvisArtwork,
  left: {
    upperArm: leftUpperArmArtwork,
    forearm: leftForearmArtwork,
  },
  right: {
    upperArm: rightUpperArmArtwork,
    forearm: rightForearmArtwork,
  },
} as const;

type InterpreterArtwork = typeof COMMON_ARTWORK & { head: string; torso: string };

const ARTWORK_BY_SET: Record<AvatarProfile['artworkSet'], InterpreterArtwork> = {
  'signverse-female-v1': {
    ...COMMON_ARTWORK,
    head: femaleHeadArtwork,
    torso: femaleTorsoArtwork,
  },
  'signverse-male-v1': {
    ...COMMON_ARTWORK,
    head: maleHeadArtwork,
    torso: maleTorsoArtwork,
  },
};

const phalanx = (
  length: number,
  width: number,
  endWidth: number,
  segment: 'proximal' | 'middle' | 'distal',
) => {
  const start = width / 2;
  const end = endWidth / 2;
  const joint = segment === 'distal' ? 2.5 : 1.8;
  const tipX = segment === 'distal' ? length + 1.8 : length + 1;
  return `
    <path
      d="M${-joint} ${-start * 0.78}C${length * 0.18} ${-start - 0.55} ${length * 0.62} ${-end - 0.35} ${length - 2.1} ${-end}C${tipX} ${-end * 0.72} ${tipX} ${end * 0.72} ${length - 2.1} ${end}C${length * 0.62} ${end + 0.35} ${length * 0.18} ${start + 0.55} ${-joint} ${start * 0.78}C${-joint - 1.8} ${start * 0.38} ${-joint - 1.8} ${-start * 0.38} ${-joint} ${-start * 0.78}Z"
      class="svi-phalanx svi-phalanx--${segment}"
      data-avatar-finger-anatomy="tapered-human-v1"
    />`;
};

const finger = (
  side: Side,
  name: Finger,
  x: number,
  y: number,
  lengths: readonly [number, number, number],
  rotation: number,
) => {
  const id = `${side}-${name}`;
  const widthScale = name === 'middle' ? 1 : name === 'little' ? 0.78 : name === 'ring' ? 0.94 : 0.96;
  return `
    <g data-avatar-anchor="${id}-mcp" transform="translate(${x} ${y})">
      <g data-avatar-part="${id}-mcp" data-parent-bone="${side}-hand" transform="rotate(${rotation})">
        ${phalanx(lengths[0], 13.4 * widthScale, 12.1 * widthScale, 'proximal')}
        <g data-avatar-anchor="${id}-pip" transform="translate(${lengths[0]} 0)">
          <g data-avatar-part="${id}-pip" data-parent-bone="${id}-mcp" transform="rotate(0)">
            ${phalanx(lengths[1], 12.1 * widthScale, 10.4 * widthScale, 'middle')}
            <g data-avatar-anchor="${id}-dip" transform="translate(${lengths[1]} 0)">
              <g data-avatar-part="${id}-dip" data-parent-bone="${id}-pip" transform="rotate(0)">
                ${phalanx(lengths[2], 10.4 * widthScale, 8.2 * widthScale, 'distal')}
                <path d="M${Math.max(3, lengths[2] - 6.5)} -2.1Q${lengths[2] - 1.8} -3.1 ${lengths[2] + 0.5} -.2" class="svi-nail"/>
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>`;
};

const thumb = (side: Side) => `
  <g data-avatar-anchor="${side}-thumb-cmc" transform="translate(13 19)">
    <g data-avatar-part="${side}-thumb-cmc" data-parent-bone="${side}-hand" transform="rotate(31)">
      ${phalanx(7, 14.4, 13.1, 'proximal')}
      <g data-avatar-anchor="${side}-thumb-mcp" transform="translate(7 0)">
        <g data-avatar-part="${side}-thumb-mcp" data-parent-bone="${side}-thumb-cmc" transform="rotate(24)">
          ${phalanx(11, 13.4, 11.8, 'proximal')}
          <g data-avatar-anchor="${side}-thumb-pip" transform="translate(11 0)">
            <g data-avatar-part="${side}-thumb-pip" data-parent-bone="${side}-thumb-mcp" transform="rotate(12)">
              ${phalanx(8, 11.8, 10.1, 'middle')}
              <g data-avatar-anchor="${side}-thumb-dip" transform="translate(8 0)">
                <g data-avatar-part="${side}-thumb-dip" data-parent-bone="${side}-thumb-pip" transform="rotate(8)">
                  ${phalanx(5.5, 10.2, 7.9, 'distal')}
                  <path d="M1 -1.7Q3.7 -2.6 5.7 -.2" class="svi-nail"/>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  </g>`;

const hand = (side: Side) => {
  // Keep the articulated bone hierarchy untouched and mirror only the artwork.
  // Mirroring the joint group itself would be overwritten by the skeletal rig.
  const artworkScaleY = side === 'right' ? -1 : 1;
  return `
  <g data-avatar-part="${side}-hand" data-parent-bone="${side}-forearm" data-avatar-hand-style="anatomical-articulated-palm-v3" transform="rotate(0)">
    <g data-avatar-hand-artwork="${side}" transform="scale(1 ${artworkScaleY})">
      ${finger(side, 'index', 34, -17, [20, 14, 10], -14)}
      ${finger(side, 'middle', 41, -7, [22, 16, 11], -5)}
      ${finger(side, 'ring', 41, 4, [21, 15, 10], 6)}
      ${finger(side, 'little', 36, 15, [16, 11, 8], 17)}
      <image data-avatar-palm-artwork="${side}" href="${anatomicalPalmArtwork}" x="-9" y="-31" width="74" height="82" preserveAspectRatio="xMidYMid meet"/>
      ${thumb(side)}
    </g>
  </g>`;
};

const arm = (side: Side, artworkSet: InterpreterArtwork) => {
  const direction = side === 'left' ? -1 : 1;
  const upper = SIGNVERSE_INTERPRETER_GEOMETRY.upperArmLength;
  const forearm = SIGNVERSE_INTERPRETER_GEOMETRY.forearmLength;
  const artwork = artworkSet[side];
  return `
    <g data-avatar-anchor="${side}-clavicle" transform="translate(${SIGNVERSE_INTERPRETER_GEOMETRY.clavicleCenter.join(' ')})">
      <g data-avatar-part="${side}-clavicle" data-parent-bone="torso" transform="rotate(0)">
        <path d="M0 0C${direction * 45} -10 ${direction * 102} -8 ${direction * SIGNVERSE_INTERPRETER_GEOMETRY.clavicleLength} 0" class="svi-clavicle"/>
        <path
          data-avatar-attachment="${side}-shoulder"
          d="M${direction * 34}-19C${direction * 72}-31 ${direction * 113}-31 ${direction * 148}-18L${direction * 153} 15C${direction * 116} 30 ${direction * 70} 29 ${direction * 32} 17Z"
          class="svi-shoulder-bridge"
        />
        <g data-avatar-anchor="${side}-shoulder" transform="translate(${direction * SIGNVERSE_INTERPRETER_GEOMETRY.clavicleLength} 0)">
          <g data-avatar-part="${side}-upper-arm" data-parent-bone="${side}-clavicle" data-bone-length="${upper}" transform="rotate(${SIGNVERSE_ARM_BIND_ROTATION[side]})">
            <path d="M-34-17C-13-30 17-28 43-13L52 10C29 25-2 29-31 18Z" class="svi-shoulder-cap svi-joint-bridge"/>
            <path d="M18-16C43-18 84-17 ${upper + 3}-13L${upper + 3} 13C84 17 43 18 18 16Z" class="svi-skin-bridge svi-joint-bridge"/>
            <g class="svi-illustrated-bone svi-illustrated-bone--upper" transform="rotate(-90)">
              <image href="${artwork.upperArm}" x="-22" y="42" width="44" height="82" preserveAspectRatio="xMidYMin meet"/>
            </g>
            <path d="M0-24C34-27 78-23 ${upper - 6}-17L${upper} 17C78 23 34 27 0 24Z" class="svi-upper-arm svi-rig-silhouette"/>
            <g data-avatar-anchor="${side}-elbow" transform="translate(${upper} 0)">
              <g data-avatar-part="${side}-forearm" data-parent-bone="${side}-upper-arm" data-bone-length="${forearm}" transform="rotate(0)">
                <ellipse rx="19" ry="18" class="svi-elbow svi-joint-bridge"/>
                <path d="M-2-15C30-19 76-17 ${forearm + 2}-12L${forearm + 2} 12C76 17 30 19-2 15Z" class="svi-forearm svi-joint-bridge"/>
                <g class="svi-illustrated-bone svi-illustrated-bone--forearm" transform="rotate(-90)">
                  <image href="${artwork.forearm}" x="-21" y="-7" width="42" height="120" preserveAspectRatio="xMidYMin meet"/>
                </g>
                <path d="M0-18C32-21 75-18 ${forearm - 4}-13L${forearm} 13C76 17 34 21 0 18Z" class="svi-forearm svi-rig-silhouette"/>
                <g data-avatar-anchor="${side}-wrist" transform="translate(${forearm} 0)">
                  <path d="M-15-16h22v32h-22c-7-8-7-24 0-32Z" class="svi-cuff"/>
                  <path d="M1-16h8v32H1Z" class="svi-cuff-trim"/>
                  ${hand(side)}
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>`;
};

const buildSvg = (profile: AvatarProfile) => {
  const artwork = ARTWORK_BY_SET[profile.artworkSet];
  const sleeveStart = profile.id === 'adult-male' ? '#4978d1' : '#6969e9';
  const sleeveEnd = profile.id === 'adult-male' ? '#284b92' : '#4447b4';
  return `
<svg viewBox="${SIGNVERSE_INTERPRETER_GEOMETRY.viewBox}" data-rig-version="${SIGNVERSE_INTERPRETER_RIG_VERSION}" data-avatar-design="${profile.artworkSet}" data-avatar-profile="${profile.id}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="presentation" focusable="false">
  <defs>
    <linearGradient id="svi-shirt" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6564e8"/><stop offset=".58" stop-color="#4f50c5"/><stop offset="1" stop-color="#35368f"/></linearGradient>
    <linearGradient id="svi-sleeve" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${sleeveStart}"/><stop offset="1" stop-color="${sleeveEnd}"/></linearGradient>
    <linearGradient id="svi-skin" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#d99678"/><stop offset="1" stop-color="#bd735b"/></linearGradient>
    <filter id="svi-shadow" x="-30%" y="-25%" width="160%" height="165%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#020712" flood-opacity=".3"/></filter>
    <style>
      .svi-clavicle{fill:none;stroke:none}
      .svi-illustrated-bone{pointer-events:none}
      .svi-joint-bridge{stroke-width:1;stroke-linejoin:round}
      .svi-skin-bridge{fill:url(#svi-skin);stroke:#704335}
      .svi-legacy-face-controls{display:none!important}
      .svi-rig-silhouette{fill:transparent!important;stroke:transparent!important;pointer-events:none}
      .svi-shoulder-bridge{fill:url(#svi-sleeve);stroke:#343690;stroke-width:1.5;stroke-linejoin:round}
      .svi-shoulder-cap,.svi-upper-arm{fill:url(#svi-sleeve);stroke:#343690;stroke-width:2}
      .svi-forearm,.svi-elbow{fill:url(#svi-skin);stroke:#704335;stroke-width:1.4}
      .svi-arm-highlight{fill:none;stroke-linecap:round}
      .svi-arm-highlight--upper{stroke:#8d8df4;stroke-width:3;opacity:.45}
      .svi-arm-highlight--forearm{stroke:#e4aa8e;stroke-width:2.2;opacity:.35}
      .svi-cuff{fill:#4059c9;stroke:#283c9d;stroke-width:1.1}
      .svi-cuff-trim{fill:#edf0f8;stroke:#c7cedd;stroke-width:.7}
      .svi-phalanx{fill:url(#svi-skin);stroke:#7c493d;stroke-linejoin:round;stroke-width:.45;stroke-opacity:.3;vector-effect:non-scaling-stroke}
      .svi-phalanx--middle,.svi-phalanx--distal{fill:url(#svi-skin)}
      .svi-nail{fill:none;stroke:#9d6252;stroke-width:.6;stroke-linecap:round;opacity:.14;vector-effect:non-scaling-stroke}
    </style>
  </defs>

  <g data-avatar-part="body" data-pivot-x="300" data-pivot-y="660" filter="url(#svi-shadow)">
    <g data-avatar-part="pelvis" data-parent-bone="body">
      <image href="${artwork.pelvis}" x="204" y="584" width="192" height="102" preserveAspectRatio="xMidYMid meet"/>
      <g data-avatar-anchor="left-hip" transform="translate(${SIGNVERSE_INTERPRETER_GEOMETRY.hips.left.join(' ')})"><g data-avatar-part="left-thigh" data-parent-bone="pelvis" opacity="0"><path d="M-48 0h82l4 67h-88Z"/></g></g>
      <g data-avatar-anchor="right-hip" transform="translate(${SIGNVERSE_INTERPRETER_GEOMETRY.hips.right.join(' ')})"><g data-avatar-part="right-thigh" data-parent-bone="pelvis" opacity="0"><path d="M-34 0h82l2 67h-88Z"/></g></g>
    </g>

    <g data-avatar-part="torso" data-parent-bone="body">
      <image data-avatar-costume="${profile.id}-professional-attire" href="${artwork.torso}" x="163" y="218" width="274" height="397" preserveAspectRatio="xMidYMin meet"/>
      <g data-avatar-brand="original-checkmark" transform="translate(300 316)" opacity="0"><circle r="1"/></g>

      ${arm('left', artwork)}
      ${arm('right', artwork)}

      <g data-avatar-anchor="neck-base" transform="translate(300 220)">
        <g data-avatar-part="neck" data-parent-bone="torso" transform="rotate(0)">
          <image href="${artwork.neck}" x="-23" y="-45" width="46" height="67" preserveAspectRatio="xMidYMid meet"/>
          <g data-avatar-anchor="head-base" transform="translate(0 -31)">
            <g data-avatar-part="head" data-parent-bone="neck" transform="rotate(0)">
              <image data-avatar-hairstyle="${profile.id}-professional" href="${artwork.head}" x="-91" y="-190" width="182" height="198" preserveAspectRatio="xMidYMid meet"/>
              <path d="M-39-94C-30-101-13-101-6-92L-8-65C-18-60-33-62-40-70ZM39-94C30-101 13-101 6-92L8-65C18-60 33-62 40-70Z" fill="#df8a46"/>

              <g data-avatar-part="eyebrows" data-pivot-x="0" data-pivot-y="-89">
                <g data-avatar-part="left-eyebrow" data-pivot-x="-23" data-pivot-y="-89"><path d="M-33-89c7-4 14-4 21 0" fill="none" stroke="#3d2637" stroke-width="3" stroke-linecap="round"/></g>
                <g data-avatar-part="right-eyebrow" data-pivot-x="23" data-pivot-y="-89"><path d="M12-89c7-4 14-4 21 0" fill="none" stroke="#3d2637" stroke-width="3" stroke-linecap="round"/></g>
              </g>
              <g data-avatar-part="eyes" data-pivot-x="0" data-pivot-y="-73">
                <g data-avatar-part="left-eye" data-pivot-x="-23" data-pivot-y="-73"><g data-avatar-control="left-eye-lid"><ellipse cx="-23" cy="-73" rx="9" ry="5.5" fill="#fff" stroke="#71483d" stroke-width="1"/><g data-avatar-control="left-pupil"><circle cx="-23" cy="-73" r="3" fill="#252440"/><circle cx="-22" cy="-74" r=".8" fill="#fff"/></g></g></g>
                <g data-avatar-part="right-eye" data-pivot-x="23" data-pivot-y="-73"><g data-avatar-control="right-eye-lid"><ellipse cx="23" cy="-73" rx="9" ry="5.5" fill="#fff" stroke="#71483d" stroke-width="1"/><g data-avatar-control="right-pupil"><circle cx="23" cy="-73" r="3" fill="#252440"/><circle cx="24" cy="-74" r=".8" fill="#fff"/></g></g></g>
              </g>
              <g data-avatar-part="nose" data-pivot-x="0" data-pivot-y="-45" class="svi-legacy-face-controls"><path d="M0-65-5-40l10 2"/></g>
              <g data-avatar-part="mouth" data-pivot-x="0" data-pivot-y="-34"><ellipse cx="0" cy="-31" rx="19" ry="11" fill="#df8a46"/><g data-avatar-part="jaw">
                <path data-avatar-mouth="neutral" d="M-12-34q12 7 24 0" fill="none" stroke="#71384a" stroke-width="2.5" stroke-linecap="round"/>
                <path data-avatar-mouth="smile" d="M-13-35q13 15 26 0" fill="none" stroke="#71384a" stroke-width="2.8" stroke-linecap="round" opacity="0"/>
                <path data-avatar-mouth="open" d="M-9-35q9-6 18 0c0 11-3 16-9 16s-9-5-9-16Z" fill="#612b3e" stroke="#71384a" stroke-width="2" opacity="0"/>
                <path data-avatar-mouth="frown" d="M-12-27q12-9 24 0" fill="none" stroke="#71384a" stroke-width="2.5" stroke-linecap="round" opacity="0"/>
                <path data-avatar-mouth="focus" d="M-10-31h20" fill="none" stroke="#71384a" stroke-width="2.5" stroke-linecap="round" opacity="0"/>
              </g></g>
            </g>
          </g>
        </g>
      </g>
    </g>
  </g>
</svg>`;
};

export function createSignVerseInterpreterSvg(profile: AvatarProfile = DEFAULT_AVATAR): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = buildSvg(profile).trim();
  return template.content.firstElementChild as unknown as SVGSVGElement;
}
