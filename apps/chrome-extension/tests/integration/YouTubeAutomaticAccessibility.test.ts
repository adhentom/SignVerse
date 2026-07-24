import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamingPortClient } from '../../content/interpretation/StreamingPortClient';
import { YouTubeAudioFallback } from '../../content/youtube/YouTubeAudioFallback';
import { appendAudioTranscript } from '../../content/youtube/audioTranscript';
import { segmentCaption } from '../../overlay/components/EnglishCaptionTrack';
import { AnimationScheduler } from '../../playback/AnimationScheduler';
import type { AudioTranscriptMessage } from '../../shared/audioCapture';
import type { StreamContentMessage, StreamServerMessage } from '../../shared/streaming';
import type { YouTubeLiveSnapshot } from '../../shared/youtube';

class ListenerChannel<T extends (...args: never[]) => void> {
  private readonly listeners = new Set<T>();
  addListener = (listener: T) => this.listeners.add(listener);
  removeListener = (listener: T) => this.listeners.delete(listener);
  emit(...args: Parameters<T>) {
    for (const listener of this.listeners) listener(...args);
  }
}

function youtubeSnapshot(caption = ''): YouTubeLiveSnapshot {
  const metadata = {
    channel: 'SignVerse test channel',
    language: caption ? 'en' : 'und',
    videoId: 'automatic-flow',
    captionsEnabled: Boolean(caption),
    isAdvertisement: false,
    isLive: false,
    playbackState: 'playing' as const,
  };
  return {
    status: caption ? 'playing' : 'captions-disabled',
    statusMessage: caption ? 'Reading captions.' : 'Captions are disabled.',
    title: 'Accessibility demo',
    timestamp: '00:07',
    metadata,
    currentPacket: caption
      ? {
          platform: 'youtube',
          title: 'Accessibility demo',
          timestamp: '00:07',
          text: caption,
          metadata,
        }
      : null,
    history: [],
  };
}

describe('automatic YouTube accessibility flow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('falls back to audio, streams a packet, and synchronizes caption and avatar playback', async () => {
    const startCapture = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const stopCapture = vi.fn<() => Promise<void>>().mockResolvedValue();
    const fallback = new YouTubeAudioFallback({
      startCapture,
      stopCapture,
      timeoutMs: 2_500,
    });
    const official = youtubeSnapshot();

    fallback.observe(official);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(startCapture).toHaveBeenCalledOnce();

    const transcript: AudioTranscriptMessage = {
      type: 'SIGNVERSE_AUDIO_TRANSCRIPT',
      target: 'content',
      tabId: 17,
      sequence: 1,
      text: 'Accessibility belongs to everyone',
      language: 'en',
    };
    expect(fallback.acceptTranscription(transcript, official)).toBe(true);
    const audioSnapshot = appendAudioTranscript(null, official, transcript);
    expect(audioSnapshot.currentPacket).toMatchObject({
      platform: 'youtube',
      text: 'Accessibility belongs to everyone',
      metadata: { transcriptionSource: 'tab-audio' },
    });

    const onMessage = new ListenerChannel<(value: unknown) => void>();
    const onDisconnect = new ListenerChannel<() => void>();
    const postMessage = vi.fn();
    const port = {
      disconnect: vi.fn(),
      onDisconnect,
      onMessage,
      postMessage,
    } as unknown as chrome.runtime.Port;
    vi.stubGlobal('chrome', {
      runtime: { connect: vi.fn(() => port), lastError: undefined },
    });

    const client = new StreamingPortClient();
    const received: StreamServerMessage[] = [];
    client.subscribe((message) => received.push(message));
    client.send(audioSnapshot.currentPacket!);

    const outbound = postMessage.mock.calls[0][0] as StreamContentMessage;
    expect(outbound).toMatchObject({
      type: 'content',
      packet: { text: 'Accessibility belongs to everyone' },
      sequence: 1,
    });

    onMessage.emit({
      type: 'interpretation',
      sequence: outbound.sequence,
      session_id: outbound.session_id,
      data: {
        summary: 'Accessibility for everyone.',
        malayalam_translation: 'എല്ലാവർക്കും പ്രവേശനക്ഷമത',
        key_points: [],
        keywords: ['accessibility'],
        glossary: [],
        isl_gloss: ['ACCESSIBILITY', 'EVERYONE'],
        confidence: 0.95,
        playback: {
          items: [
            {
              token_id: 'accessibility',
              asset_id: 'asset-accessibility',
              duration: 1,
              confidence: 0.95,
              transition_ms: 180,
            },
            {
              token_id: 'everyone',
              asset_id: 'asset-everyone',
              duration: 1,
              confidence: 0.94,
              transition_ms: 180,
            },
          ],
          unsupported_tokens: [],
        },
      },
    });

    expect(received).toHaveLength(1);
    const playback = received[0].type === 'interpretation'
      ? received[0].data.playback
      : undefined;
    expect(playback).toBeDefined();
    const scheduler = new AnimationScheduler(playback!);
    const captions = segmentCaption(transcript.text, playback!.items.length);
    expect(captions[scheduler.locate(0.5)!.index]).toBe('Accessibility belongs');
    expect(captions[scheduler.locate(1.5)!.index]).toBe('to everyone');

    const officialCaption = youtubeSnapshot('Official captions resumed.');
    fallback.observe(officialCaption);
    expect(stopCapture).toHaveBeenCalledOnce();
    expect(fallback.acceptTranscription({ ...transcript, sequence: 2 }, officialCaption)).toBe(false);

    client.close();
    fallback.dispose();
  });
});
