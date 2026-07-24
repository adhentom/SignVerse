import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findYouTubeTranscriptTrack,
  loadYouTubeTranscript,
  parseYouTubeTranscript,
  parseYouTubeTranscriptResponse,
  transcriptCueAt,
} from '../../content/youtube/YouTubeTranscriptTrack';

describe('YouTubeTranscriptTrack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const response = {
    videoDetails: { videoId: 'video-1' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=ml', languageCode: 'ml' },
          { baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=en', languageCode: 'en' },
        ],
      },
    },
  };

  it('selects the English official transcript without requiring the CC button', () => {
    const source = `var ytInitialPlayerResponse = ${JSON.stringify(response)};`;
    expect(findYouTubeTranscriptTrack(source, 'video-1')).toEqual({
      baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=en',
      language: 'en',
    });
    expect(findYouTubeTranscriptTrack(source, 'another-video')).toBeNull();
  });

  it('parses timed transcript events and synchronizes them to playback time', () => {
    const cues = parseYouTubeTranscript({
      events: [
        { tStartMs: 1_000, dDurationMs: 2_000, segs: [{ utf8: 'Hello ' }, { utf8: 'there' }] },
        { tStartMs: 3_000, dDurationMs: 1_500, segs: [{ utf8: 'Welcome back' }] },
      ],
    });
    expect(cues).toEqual([
      { startSeconds: 1, endSeconds: 3, text: 'Hello there' },
      { startSeconds: 3, endSeconds: 4.5, text: 'Welcome back' },
    ]);
    expect(transcriptCueAt(cues, 2)?.text).toBe('Hello there');
    expect(transcriptCueAt(cues, 3.2)?.text).toBe('Welcome back');
    expect(transcriptCueAt(cues, 8)).toBeNull();
  });

  it('parses the current XML and SRV3 timed-text formats', () => {
    expect(parseYouTubeTranscriptResponse(
      '<transcript><text start="1.5" dur="2">Hello &amp; welcome</text></transcript>',
    )).toEqual([
      { startSeconds: 1.5, endSeconds: 3.5, text: 'Hello & welcome' },
    ]);
    expect(parseYouTubeTranscriptResponse(
      '<timedtext><body><p t="3000" d="1500"><s>Current </s><s>format</s></p></body></timedtext>',
    )).toEqual([
      { startSeconds: 3, endSeconds: 4.5, text: 'Current format' },
    ]);
  });

  it('handles empty and malformed successful responses without throwing', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadYouTubeTranscript({
      baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=en',
      language: 'en',
    }, new AbortController().signal)).resolves.toEqual([]);
    expect(parseYouTubeTranscriptResponse('{not-json')).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.youtube.com/api/timedtext?v=video-1&lang=en',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads JSON3 without forcing a format query parameter', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      events: [
        { tStartMs: 2_000, dDurationMs: 1_000, segs: [{ utf8: 'Loaded cue' }] },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadYouTubeTranscript({
      baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=en',
      language: 'en',
    }, new AbortController().signal)).resolves.toEqual([
      { startSeconds: 2, endSeconds: 3, text: 'Loaded cue' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.youtube.com/api/timedtext?v=video-1&lang=en',
      expect.any(Object),
    );
  });
});
