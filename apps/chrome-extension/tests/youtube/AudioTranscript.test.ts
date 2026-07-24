import { describe, expect, it } from 'vitest';

import { appendAudioTranscript, audioStatusSnapshot } from '../../content/youtube/audioTranscript';
import type { YouTubeLiveSnapshot } from '../../shared/youtube';

const official: YouTubeLiveSnapshot = {
  status: 'no-captions',
  statusMessage: 'No official captions are available.',
  title: 'Accessible video',
  timestamp: '01:24',
  metadata: {
    channel: 'SignVerse Channel',
    language: 'und',
    videoId: 'video-1',
    captionsEnabled: false,
    isAdvertisement: false,
    isLive: false,
    playbackTimeMs: 84_000,
    playbackState: 'playing',
  },
  currentPacket: null,
  history: [],
};

describe('YouTube tab-audio transcripts', () => {
  it('turns spoken English into the same ContentPacket used by the interpreter', () => {
    const snapshot = appendAudioTranscript(null, official, {
      type: 'SIGNVERSE_AUDIO_TRANSCRIPT',
      target: 'content',
      tabId: 1,
      sequence: 1,
      text: '  Spoken   English from the video. ',
      language: 'en',
      durationMs: 2_000,
    });

    expect(snapshot.currentPacket).toMatchObject({
      platform: 'youtube',
      title: 'Accessible video',
      timestamp: '01:24',
      text: 'Spoken English from the video.',
      metadata: {
        captionEndMs: 84_000,
        captionSource: 'tab-audio',
        captionStartMs: 82_000,
        cueId: 'video-1:tab-audio:1:82000',
        transcriptionSource: 'tab-audio',
        videoId: 'video-1',
      },
    });
    expect(snapshot.history).toHaveLength(1);
  });

  it('retains the latest transcript while the next audio segment is starting', () => {
    const playing = appendAudioTranscript(null, official, {
      type: 'SIGNVERSE_AUDIO_TRANSCRIPT', target: 'content', tabId: 1,
      sequence: 1, text: 'Current spoken caption.', language: 'en',
    });
    const loading = audioStatusSnapshot(playing, official, {
      type: 'SIGNVERSE_AUDIO_CAPTURE_STATUS', target: 'content', tabId: 1,
      status: 'starting', message: 'Connecting to tab audio…',
    });

    expect(loading.currentPacket?.text).toBe('Current spoken caption.');
  });
});
