import type {
  AnimationAssetDefinition,
  AvatarAssetBundle,
  AvatarManifest,
  ExpressionAssetDefinition,
  HandshapeAssetDefinition,
  TransitionAssetDefinition,
} from './types';
import { AVATAR_PROFILES } from '../../avatarProfiles';
import { SIGNVERSE_HAND_SHAPES } from '../signVerseInterpreter/handShapeLibrary';
import { SIGNVERSE_INTERPRETER_RIG_VERSION } from '../signVerseInterpreter/interpreterGeometry';

export interface AvatarAssetValidationOptions {
  supportedManifestMajor: number;
  supportedAnimationMajor: number;
}

export interface AvatarAssetValidationResult {
  bundle?: AvatarAssetBundle;
  failures: string[];
}

type UnknownRecord = Record<string, unknown>;

const PROFILE_IDS = new Set(['adult-female', 'adult-male']);
const RENDERER_KINDS = new Set(['svg', 'glb', 'vrm']);
const INTERPOLATION_PROFILES = new Set(['linear', 'ease', 'directional', 'emphasis']);
const RIG_IDS = new Map<string, string>(
  AVATAR_PROFILES.map((profile) => [profile.id, profile.rigId]),
);
const HANDSHAPE_IDS = new Set<string>(SIGNVERSE_HAND_SHAPES);

function record(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}

function major(version: unknown): number | undefined {
  if (!text(version)) return undefined;
  const match = /^(\d+)(?:\.\d+){0,2}$/u.exec(version);
  return match ? Number(match[1]) : undefined;
}

function duplicateIds(values: unknown[], library: string, failures: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!record(value) || !text(value.id)) continue;
    if (seen.has(value.id)) failures.push(`${library} contains duplicate id "${value.id}".`);
    seen.add(value.id);
  }
}

function validateManifest(
  value: unknown,
  options: AvatarAssetValidationOptions,
  failures: string[],
): value is AvatarManifest {
  if (!record(value)) {
    failures.push('Avatar manifest must be an object.');
    return false;
  }
  if (value.schemaVersion !== '1.0') failures.push('Avatar manifest schemaVersion must be "1.0".');
  for (const field of ['avatarVersion', 'rigVersion', 'animationVersion'] as const) {
    if (major(value[field]) === undefined) failures.push(`Avatar manifest ${field} is invalid.`);
  }
  if (major(value.avatarVersion) !== options.supportedManifestMajor) {
    failures.push(`Avatar version ${String(value.avatarVersion)} is unsupported.`);
  }
  if (major(value.animationVersion) !== options.supportedAnimationMajor) {
    failures.push(`Animation version ${String(value.animationVersion)} is unsupported.`);
  }
  if (value.rigVersion !== SIGNVERSE_INTERPRETER_RIG_VERSION) {
    failures.push(`Avatar rig version ${String(value.rigVersion)} is unsupported.`);
  }
  if (!PROFILE_IDS.has(String(value.defaultProfile))) {
    failures.push('Avatar manifest defaultProfile is unsupported.');
  }
  if (!text(value.defaultRenderer)) failures.push('Avatar manifest defaultRenderer is required.');

  const supportedFeatures = value.supportedFeatures;
  if (!record(supportedFeatures) ||
      ['handShapes', 'facialExpressions', 'eyeTracking', 'secondaryMotion']
        .some((feature) => typeof supportedFeatures[feature] !== 'boolean')) {
    failures.push('Avatar manifest supportedFeatures is invalid.');
  }
  const libraries = value.libraries;
  if (!record(libraries) ||
      ['animations', 'handshapes', 'expressions', 'transitions']
        .some((library) => !text(libraries[library]))) {
    failures.push('Avatar manifest library references are invalid.');
  }
  if (!stringArray(value.frequentlyUsedAnimations)) {
    failures.push('Avatar manifest frequentlyUsedAnimations must be an array of IDs.');
  }
  if (!Array.isArray(value.renderers) || value.renderers.length === 0) {
    failures.push('Avatar manifest must declare at least one renderer.');
  } else {
    duplicateIds(value.renderers, 'Avatar renderers', failures);
    for (const renderer of value.renderers) {
      if (!record(renderer) || !text(renderer.id) || !RENDERER_KINDS.has(String(renderer.kind)) ||
          major(renderer.version) === undefined || !text(renderer.rigId) ||
          !stringArray(renderer.profiles) || renderer.profiles.length === 0 ||
          renderer.profiles.some((id) => !PROFILE_IDS.has(id)) ||
          typeof renderer.fallback !== 'boolean') {
        failures.push('Avatar manifest contains an invalid renderer entry.');
      } else if (renderer.profiles.some((profileId) => RIG_IDS.get(profileId) !== renderer.rigId)) {
        failures.push(`Renderer "${renderer.id}" is incompatible with its profile rig.`);
      }
    }
    if (!value.renderers.some((entry) => record(entry) && entry.id === value.defaultRenderer)) {
      failures.push('Avatar manifest defaultRenderer does not reference a declared renderer.');
    }
    const defaultRenderer = value.renderers.find(
      (entry) => record(entry) && entry.id === value.defaultRenderer,
    );
    if (record(defaultRenderer) && stringArray(defaultRenderer.profiles) &&
        !defaultRenderer.profiles.includes(String(value.defaultProfile))) {
      failures.push('Avatar manifest defaultRenderer does not support defaultProfile.');
    }
    if (!value.renderers.some((entry) => record(entry) && entry.fallback === true)) {
      failures.push('Avatar manifest does not declare a fallback renderer.');
    }
  }
  return failures.length === 0;
}

function validateHandshapes(value: unknown, failures: string[]): value is HandshapeAssetDefinition[] {
  if (!Array.isArray(value)) {
    failures.push('Handshape library must be an array.');
    return false;
  }
  duplicateIds(value, 'Handshape library', failures);
  const terms = new Set<string>();
  for (const entry of value) {
    if (!record(entry) || !text(entry.id) || !text(entry.rendererShapeId) ||
        !stringArray(entry.aliases) || major(entry.version) === undefined) {
      failures.push('Handshape library contains invalid metadata.');
      continue;
    }
    if (!HANDSHAPE_IDS.has(entry.rendererShapeId)) {
      failures.push(`Handshape "${entry.id}" references unsupported renderer shape "${entry.rendererShapeId}".`);
    }
    for (const term of [entry.id, ...entry.aliases].map((item) => item.toLowerCase())) {
      if (terms.has(term)) failures.push(`Handshape alias "${term}" is ambiguous.`);
      terms.add(term);
    }
  }
  return failures.length === 0;
}

function validateExpressions(value: unknown, failures: string[]): value is ExpressionAssetDefinition[] {
  if (!Array.isArray(value)) {
    failures.push('Expression library must be an array.');
    return false;
  }
  duplicateIds(value, 'Expression library', failures);
  for (const entry of value) {
    if (!record(entry) || !text(entry.id) || !stringArray(entry.nonManualMarkers) ||
        major(entry.version) === undefined) {
      failures.push('Expression library contains invalid metadata.');
    }
  }
  return failures.length === 0;
}

function validateTransitions(value: unknown, failures: string[]): value is TransitionAssetDefinition[] {
  if (!Array.isArray(value)) {
    failures.push('Transition library must be an array.');
    return false;
  }
  duplicateIds(value, 'Transition library', failures);
  for (const entry of value) {
    if (!record(entry) || !text(entry.id) ||
        !/^(?:linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\([^)]*\))$/u
          .test(String(entry.easing)) ||
        !positive(entry.duration) ||
        !INTERPOLATION_PROFILES.has(String(entry.interpolationProfile)) ||
        major(entry.version) === undefined) {
      failures.push('Transition library contains invalid metadata.');
    }
  }
  return failures.length === 0;
}

function validateAnimationCycles(
  animations: AnimationAssetDefinition[],
  failures: string[],
): void {
  const byId = new Map(animations.map((entry) => [entry.id, entry]));
  for (const animation of animations) {
    const visited = new Set<string>();
    let current: AnimationAssetDefinition | undefined = animation;
    while (current?.fallbackAnimationId) {
      if (visited.has(current.id)) {
        failures.push(`Animation fallback contains a circular reference at "${current.id}".`);
        break;
      }
      visited.add(current.id);
      current = byId.get(current.fallbackAnimationId);
    }
  }
}

function validateAnimations(
  value: unknown,
  handshapes: HandshapeAssetDefinition[],
  expressions: ExpressionAssetDefinition[],
  transitions: TransitionAssetDefinition[],
  options: AvatarAssetValidationOptions,
  failures: string[],
): value is AnimationAssetDefinition[] {
  if (!Array.isArray(value)) {
    failures.push('Animation library must be an array.');
    return false;
  }
  duplicateIds(value, 'Animation library', failures);
  const animationIds = new Set(
    value.filter(record).map((entry) => entry.id).filter(text),
  );
  const handshapeIds = new Set(handshapes.map((entry) => entry.id));
  const expressionIds = new Set(expressions.map((entry) => entry.id));
  const transitionIds = new Set(transitions.map((entry) => entry.id));
  for (const entry of value) {
    if (!record(entry) || !text(entry.id) || !text(entry.source) || !positive(entry.duration) ||
        !text(entry.defaultBlendProfile) || !text(entry.transitionProfile) ||
        !text(entry.expressionProfile) || !text(entry.requiredHandshape) ||
        major(entry.version) !== options.supportedAnimationMajor) {
      failures.push('Animation library contains invalid metadata.');
      continue;
    }
    if (!transitionIds.has(entry.transitionProfile)) {
      failures.push(`Animation "${entry.id}" references missing transition "${entry.transitionProfile}".`);
    }
    if (!transitionIds.has(entry.defaultBlendProfile)) {
      failures.push(`Animation "${entry.id}" references missing blend profile "${entry.defaultBlendProfile}".`);
    }
    if (!expressionIds.has(entry.expressionProfile)) {
      failures.push(`Animation "${entry.id}" references missing expression "${entry.expressionProfile}".`);
    }
    if (!handshapeIds.has(entry.requiredHandshape)) {
      failures.push(`Animation "${entry.id}" references missing handshape "${entry.requiredHandshape}".`);
    }
    if (entry.fallbackAnimationId !== undefined &&
        (!text(entry.fallbackAnimationId) || !animationIds.has(entry.fallbackAnimationId))) {
      failures.push(`Animation "${entry.id}" references a missing fallback animation.`);
    }
    if (entry.integrity !== undefined && (
      !text(entry.integrity) ||
      !/^(?:sha256-[A-Za-z0-9+/]{43}=|[a-fA-F0-9]{64})$/u.test(entry.integrity)
    )) {
      failures.push(`Animation "${entry.id}" has invalid integrity metadata.`);
    }
  }
  validateAnimationCycles(value as AnimationAssetDefinition[], failures);
  return failures.length === 0;
}

export function validateAvatarAssetBundle(
  value: unknown,
  options: AvatarAssetValidationOptions,
): AvatarAssetValidationResult {
  const failures: string[] = [];
  if (!record(value)) return { failures: ['Avatar asset bundle must be an object.'] };
  const manifestFailures: string[] = [];
  const handshapeFailures: string[] = [];
  const expressionFailures: string[] = [];
  const transitionFailures: string[] = [];
  const animationFailures: string[] = [];
  const manifestValid = validateManifest(value.manifest, options, manifestFailures);
  const handshapesValid = validateHandshapes(value.handshapes, handshapeFailures);
  const expressionsValid = validateExpressions(value.expressions, expressionFailures);
  const transitionsValid = validateTransitions(value.transitions, transitionFailures);
  const animationsValid = validateAnimations(
    value.animations,
    handshapesValid ? value.handshapes as HandshapeAssetDefinition[] : [],
    expressionsValid ? value.expressions as ExpressionAssetDefinition[] : [],
    transitionsValid ? value.transitions as TransitionAssetDefinition[] : [],
    options,
    animationFailures,
  );
  failures.push(
    ...manifestFailures,
    ...handshapeFailures,
    ...expressionFailures,
    ...transitionFailures,
    ...animationFailures,
  );
  if (!manifestValid || !handshapesValid || !expressionsValid ||
      !transitionsValid || !animationsValid || failures.length > 0) {
    return { failures: [...new Set(failures)] };
  }
  const bundle = value as unknown as AvatarAssetBundle;
  const animationIds = new Set(bundle.animations.map((entry) => entry.id));
  for (const id of bundle.manifest.frequentlyUsedAnimations) {
    if (!animationIds.has(id)) {
      failures.push(`Frequently used animation "${id}" is not declared.`);
    }
  }
  return failures.length > 0 ? { failures } : { bundle, failures: [] };
}
