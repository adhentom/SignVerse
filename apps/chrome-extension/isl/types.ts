import type {
  NonManualMarker,
  PlaybackMiss,
  PlaybackSequence,
} from '../shared/interpretation';

export type GlossCategory =
  | 'lexical'
  | 'classifier'
  | 'fingerspelling'
  | 'number'
  | 'date'
  | 'proper-noun'
  | 'unknown';

export interface SourceContext {
  text: string;
  locale?: string;
  platform?: 'website' | 'youtube' | 'google-meet' | string;
  speaker?: string;
  previousTurns?: readonly string[];
}

export interface SentenceSegment {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface NormalizedContext {
  sourceText: string;
  normalizedText: string;
  locale: string;
  platform: string;
  speaker?: string;
  previousTurns: readonly string[];
}

export interface GrammarFeatures {
  sentenceType: 'statement' | 'question' | 'command' | 'fragment';
  polarity: 'positive' | 'negative';
  modality: readonly string[];
  pronouns: readonly string[];
  temporalMarkers: readonly string[];
}

export interface GrammarUnit {
  id: string;
  text: string;
  tokens: readonly string[];
  features: GrammarFeatures;
}

export interface GlossCandidate {
  id: string;
  sourceSegmentId: string;
  concept: string;
  gloss: string;
  confidence: number;
  category: GlossCategory;
  nonManualMarkers?: readonly NonManualMarker[];
}

export interface GlossProviderInput {
  context: NormalizedContext;
  grammar: readonly GrammarUnit[];
}

export interface GlossProviderOutput {
  candidates: readonly GlossCandidate[];
  confidence: number;
  diagnostics?: Readonly<Record<string, unknown>>;
  segmentDiagnostics?: readonly SegmentInterpretationDiagnostics[];
}

export interface SegmentInterpretationDiagnostics {
  segmentId: string;
  confidence: number;
  receivedGlosses: readonly string[];
  acceptedGlosses: readonly string[];
  fingerspelledGlosses: readonly string[];
  rejectedGlosses: readonly {
    gloss: string;
    reason: string;
  }[];
  backendDiagnostics?: Readonly<Record<string, unknown>>;
}

export interface GlossMapping {
  source: string;
  canonicalGlosses: readonly string[];
  locale: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  version: string;
}

export interface VocabularyEntry {
  tokenId: string;
  concept: string;
  gloss: string;
  aliases: readonly string[];
  category: GlossCategory;
  language: 'ISL';
  region: string;
  version: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
}

export interface SignMetadataEntry {
  tokenId: string;
  assetId: string;
  durationSeconds: number;
  animationAvailable: boolean;
  confidence: number;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  version: string;
}

export interface TransitionRule {
  fromCategory: GlossCategory | '*';
  toCategory: GlossCategory | '*';
  durationMs: number;
  reviewStatus: 'pending' | 'approved';
}

export interface InterpretationDatabases {
  glossMappings: readonly GlossMapping[];
  vocabulary: readonly VocabularyEntry[];
  signMetadata: readonly SignMetadataEntry[];
  transitionRules: readonly TransitionRule[];
}

export type VocabularyMatch =
  | { status: 'exact' | 'alias'; candidate: GlossCandidate; entry: VocabularyEntry }
  | { status: 'missing'; candidate: GlossCandidate };

export type UnknownResolution =
  | { status: 'fingerspelled'; source: GlossCandidate; candidates: readonly GlossCandidate[] }
  | { status: 'unsupported'; source: GlossCandidate; reason: string };

export interface AnimationPlanItem {
  candidate: GlossCandidate;
  vocabulary: VocabularyEntry;
  sign: SignMetadataEntry;
  transitionMs: number;
}

export interface AnimationPlan {
  items: readonly AnimationPlanItem[];
  missing: readonly PlaybackMiss[];
}

export interface ISLInterpretationResult {
  segments: readonly SentenceSegment[];
  context: NormalizedContext;
  grammar: readonly GrammarUnit[];
  glosses: readonly GlossCandidate[];
  provider: {
    id: string;
    confidence: number;
    diagnostics?: Readonly<Record<string, unknown>>;
    segments: readonly SegmentInterpretationDiagnostics[];
  };
  animationPlan: AnimationPlan;
  playback: PlaybackSequence;
}
