import glossMappings from './glossMappings.json';
import signMetadata from './signMetadata.json';
import transitionRules from './transitionRules.json';
import vocabulary from './vocabulary.json';
import type {
  GlossMapping,
  InterpretationDatabases,
  SignMetadataEntry,
  TransitionRule,
  VocabularyEntry,
} from '../types';

interface DatabaseDocument<T> {
  version: string;
  entries: T[];
}

function entries<T>(document: DatabaseDocument<T>): readonly T[] {
  if (!document.version.trim() || !Array.isArray(document.entries)) {
    throw new Error('Invalid ISL database document.');
  }
  return Object.freeze([...document.entries]);
}

export const defaultInterpretationDatabases: InterpretationDatabases = Object.freeze({
  glossMappings: entries(glossMappings as DatabaseDocument<GlossMapping>),
  vocabulary: entries(vocabulary as DatabaseDocument<VocabularyEntry>),
  signMetadata: entries(signMetadata as DatabaseDocument<SignMetadataEntry>),
  transitionRules: entries(transitionRules as DatabaseDocument<TransitionRule>),
});
