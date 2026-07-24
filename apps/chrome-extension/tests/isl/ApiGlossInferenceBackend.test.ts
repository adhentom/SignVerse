import { describe, expect, it, vi } from 'vitest';
import { ApiGlossInferenceBackend } from '../../isl/providers/ApiGlossInferenceBackend';
import type { InterpretationResponse } from '../../shared/interpretation';

describe('ApiGlossInferenceBackend', () => {
  it('adapts structured API segments without trusting API playback mappings', async () => {
    const response: InterpretationResponse = {
      summary: 'Greeting',
      malayalam_translation: '',
      key_points: [],
      keywords: [],
      glossary: [],
      isl_gloss: ['HELLO'],
      confidence: 0.8,
      playback: {
        items: [{
          token_id: 'untrusted',
          asset_id: 'untrusted',
          duration: 1,
          confidence: 1,
        }],
        unsupported_tokens: [],
      },
      isl_segments: [{
        segment_id: 'backend-segment',
        meaning: 'greeting',
        discourse_function: 'greeting',
        confidence: 0.9,
        glosses: [{
          gloss: 'HELLO',
          role: 'greeting',
          referent: '',
          classifier: '',
          emphasis: 0,
          non_manual_markers: [],
          confidence: 0.92,
        }],
      }],
      quality: {
        semantic_accuracy: 0.9,
        malayalam_translation: 0.8,
        gloss_correctness: 0.91,
      },
    };
    const interpret = vi.fn().mockResolvedValue(response);
    const backend = new ApiGlossInferenceBackend({ interpret }, 'openai-api');

    const result = await backend.infer({
      context: {
        sourceText: 'Hello.',
        normalizedText: 'Hello.',
        locale: 'en',
        platform: 'youtube',
        speaker: 'Asha',
        previousTurns: ['Welcome'],
      },
      grammar: [{
        id: 'sentence-1',
        text: 'Hello.',
        tokens: ['Hello'],
        features: {
          sentenceType: 'statement',
          polarity: 'positive',
          modality: [],
          pronouns: [],
          temporalMarkers: [],
        },
      }],
    });

    expect(interpret).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'youtube',
      speaker: 'Asha',
      text: 'Hello.',
      metadata: expect.objectContaining({ semanticFirst: true }),
    }));
    expect(result.confidence).toBe(0.91);
    expect(result.segments[0]).toMatchObject({
      sourceSegmentId: 'sentence-1',
      glosses: [{ gloss: 'HELLO', confidence: 0.92 }],
    });
    expect(JSON.stringify(result)).not.toContain('untrusted');
  });
});
