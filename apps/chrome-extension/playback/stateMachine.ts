import type { RendererState } from './types';

const TRANSITIONS: Record<RendererState, readonly RendererState[]> = {
  Idle: ['Loading', 'Playing', 'Paused', 'Error'],
  Loading: ['Idle', 'Playing', 'Paused', 'Error'],
  Playing: ['Loading', 'Paused', 'Finished', 'Error'],
  Paused: ['Loading', 'Playing', 'Finished', 'Idle', 'Error'],
  Finished: ['Loading', 'Playing', 'Idle', 'Error'],
  Error: ['Loading', 'Playing', 'Idle'],
};

export function transitionRendererState(current: RendererState, next: RendererState): RendererState {
  return current === next || TRANSITIONS[current].includes(next) ? next : current;
}
