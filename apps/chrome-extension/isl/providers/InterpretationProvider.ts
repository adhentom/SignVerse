import type { ISLGlossProvider } from './ISLGlossProvider';

/**
 * Production interpretation boundary consumed by InterpretationEngine.
 *
 * Implementations may use an OpenAI-backed service, a local model, or
 * deterministic rules. Downstream vocabulary and playback code depends only
 * on this contract.
 */
export interface InterpretationProvider extends ISLGlossProvider {
  readonly backendId: string;
}
