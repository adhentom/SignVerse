import type {
  GlossCategory,
  GlossProviderInput,
} from '../types';
import type { NonManualMarker } from '../../shared/interpretation';

export interface InferredGloss {
  concept: string;
  gloss: string;
  confidence: number;
  category?: GlossCategory;
  nonManualMarkers?: readonly NonManualMarker[];
}

export interface InferredSegment {
  sourceSegmentId: string;
  confidence: number;
  glosses: readonly InferredGloss[];
  diagnostics?: Readonly<Record<string, unknown>>;
}

export interface GlossInferenceResult {
  segments: readonly InferredSegment[];
  confidence: number;
  diagnostics?: Readonly<Record<string, unknown>>;
}

export interface GlossInferenceBackend {
  readonly id: string;
  infer(input: GlossProviderInput): Promise<GlossInferenceResult>;
}

export class InferenceBackendRegistry {
  private readonly backends = new Map<string, GlossInferenceBackend>();

  register(backend: GlossInferenceBackend): void {
    if (this.backends.has(backend.id)) {
      throw new Error(`Gloss inference backend "${backend.id}" is already registered.`);
    }
    this.backends.set(backend.id, backend);
  }

  resolve(id: string): GlossInferenceBackend {
    const backend = this.backends.get(id);
    if (!backend) throw new Error(`Gloss inference backend "${id}" is not registered.`);
    return backend;
  }
}
