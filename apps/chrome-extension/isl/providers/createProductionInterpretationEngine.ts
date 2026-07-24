import type { InterpretationApiClient } from './ApiGlossInferenceBackend';
import { ApiGlossInferenceBackend } from './ApiGlossInferenceBackend';
import { ProductionInterpretationProvider } from './ProductionInterpretationProvider';
import { InterpretationEngine, type InterpretationEngineOptions } from '../InterpretationEngine';
import type { InterpretationDatabases } from '../types';

export function createProductionInterpretationEngine(
  client: InterpretationApiClient,
  databases: InterpretationDatabases,
  engineOptions?: InterpretationEngineOptions,
): InterpretationEngine {
  const backend = new ApiGlossInferenceBackend(client);
  const provider = new ProductionInterpretationProvider(backend, databases.vocabulary);
  return new InterpretationEngine(provider, databases, engineOptions);
}
