import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captionTimeoutMs,
  YouTubeAudioFallback,
} from '../../content/youtube/YouTubeAudioFallback';
import type { AudioTranscriptMessage } from '../../shared/audioCapture';
import type { YouTubeLiveSnapshot } from '../../shared/youtube';

function snapshot(caption = ''): YouTubeLiveSnapshot {
  const metadata = {
    channel: 'Channel',
    language: caption ? 'en' : 'und',
    videoId: 'video-1',
    captionsEnabled: Boolean(caption),
    isAdvertisement: false,
    isLive: false,
    playbackState: 'playing' as const,
  };
  return {
    status: caption ? 'playing' : 'captions-disabled',
    statusMessage: caption ? 'Reading captions.' : 'Captions are disabled.',
    title: 'Video',
    timestamp: '00:05',
    metadata,
    currentPacket: caption
      ? { platform: 'youtube', title: 'Video', timestamp: '00:05', text: caption, metadata }
      : null,
    history: [],
  };
}

function transcript(sequence = 1, text = 'Audio transcription.'): AudioTranscriptMessage {
  return {
    type: 'SIGNVERSE_AUDIO_TRANSCRIPT',
    target: 'content',
    tabId: 7,
    sequence,
    text,
    language: 'en',
  };
}

describe('YouTubeAudioFallback', () => {
  const startCapture = vi.fn<() => Promise<boolean>>();
  const stopCapture = vi.fn<() => Promise<void>>();
  const logger = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    startCapture.mockReset().mockResolvedValue(true);
    stopCapture.mockReset().mockResolvedValue();
    logger.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function controller(): YouTubeAudioFallback {
    return new YouTubeAudioFallback({
      logger,
      startCapture,
      stopCapture,
      timeoutMs: 2_500,
    });
  }

  it('keeps official captions active without starting audio capture', async () => {
    const fallback = controller();
    fallback.observe(snapshot('Official caption.'));
    await vi.advanceTimersByTimeAsync(3_000);

    expect(startCapture).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith('caption_available', expect.objectContaining({
      videoId: 'video-1',
    }));
  });

  it('starts audio capture when captions remain disabled for the timeout', async () => {
    const fallback = controller();
    fallback.observe(snapshot());
    await vi.advanceTimersByTimeAsync(2_500);

    expect(startCapture).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith('caption_timeout', expect.objectContaining({
      timeoutMs: 2_500,
    }));
    expect(logger).toHaveBeenCalledWith('audio_fallback_started', expect.any(Object));
  });

  it('stops fallback and rejects late audio when captions appear', async () => {
    const fallback = controller();
    fallback.observe(snapshot());
    await vi.advanceTimersByTimeAsync(2_500);
    fallback.observe(snapshot('Captions are back.'));

    expect(stopCapture).toHaveBeenCalledTimes(1);
    expect(fallback.acceptTranscription(transcript(), snapshot('Captions are back.'))).toBe(false);
  });

  it('handles transcription startup failure without producing a packet', async () => {
    startCapture.mockRejectedValueOnce(new Error('Capture failed'));
    const fallback = controller();
    fallback.observe(snapshot());
    await vi.advanceTimersByTimeAsync(2_500);

    expect(logger).toHaveBeenCalledWith('audio_fallback_failed', {
      error: 'Capture failed',
    });
    expect(fallback.acceptTranscription(transcript(1, ''), snapshot())).toBe(false);
  });

  it('accepts one audio transcript and prevents duplicate packets', () => {
    const fallback = controller();

    expect(fallback.acceptTranscription(transcript(1, 'Repeated speech.'), snapshot())).toBe(true);
    expect(fallback.acceptTranscription(transcript(2, ' Repeated   speech. '), snapshot())).toBe(false);
    expect(fallback.acceptTranscription(transcript(4, 'Repeated speech.'), snapshot())).toBe(true);
    expect(logger).toHaveBeenCalledWith('transcription_received', expect.objectContaining({
      textLength: 16,
    }));
  });

  it('supports a configurable timeout with a guarded default', () => {
    expect(captionTimeoutMs('3000')).toBe(3_000);
    expect(captionTimeoutMs('100')).toBe(2_500);
    expect(captionTimeoutMs(undefined)).toBe(2_500);
  });
});
