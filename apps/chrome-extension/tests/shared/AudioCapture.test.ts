import { describe, expect, it } from 'vitest';

import { isAudioCaptureMessage } from '../../shared/audioCapture';

describe('audio capture messaging', () => {
  it('accepts typed capture events and rejects unrelated runtime messages', () => {
    expect(isAudioCaptureMessage({
      type: 'SIGNVERSE_AUDIO_FALLBACK_START',
      target: 'background',
    })).toBe(true);
    expect(isAudioCaptureMessage({
      type: 'SIGNVERSE_AUDIO_TRANSCRIPT',
      target: 'content',
      tabId: 7,
      sequence: 2,
      text: 'Accessible captions from speech.',
      language: 'en',
    })).toBe(true);
    expect(isAudioCaptureMessage({ type: 'SIGNVERSE_CONTENT_READY' })).toBe(false);
    expect(isAudioCaptureMessage(null)).toBe(false);
  });
});
