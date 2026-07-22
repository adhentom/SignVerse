import { describe, expect, it } from 'vitest';
import { transitionRendererState } from '../../playback/stateMachine';

describe('renderer state machine', () => {
  it('accepts valid transitions and rejects invalid transitions', () => {
    expect(transitionRendererState('Idle', 'Loading')).toBe('Loading');
    expect(transitionRendererState('Idle', 'Playing')).toBe('Playing');
    expect(transitionRendererState('Loading', 'Playing')).toBe('Playing');
    expect(transitionRendererState('Playing', 'Finished')).toBe('Finished');
    expect(transitionRendererState('Idle', 'Finished')).toBe('Idle');
  });
});
