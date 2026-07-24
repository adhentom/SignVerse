import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeLiveSnapshot } from '../../shared/youtube';
import { YouTubeAdapter } from '../../content/youtube/YouTubeAdapter';
import { YouTubeCaptionSession } from '../../content/youtube/YouTubeCaptionSession';
import { resolveLiveSourceText } from '../../shared/liveContent';
import {
  formatPlaybackTimestamp,
  isYouTubeWatchPage,
} from '../../content/youtube/youtubeUtils';

function renderYouTubePlayer(options?: {
  captionsPressed?: boolean;
  caption?: string;
  paused?: boolean;
  duration?: number;
}) {
  document.body.innerHTML = `
    <ytd-watch-flexy>
      <h1 class="ytd-watch-metadata"><yt-formatted-string>Test Video</yt-formatted-string></h1>
      <ytd-channel-name><a>Test Channel</a></ytd-channel-name>
      <div id="movie_player">
        <button
          class="ytp-subtitles-button"
          aria-pressed="${options?.captionsPressed ?? true}"
          aria-label="Subtitles/closed captions"
        ></button>
        <video class="html5-main-video"></video>
        <div class="ytp-caption-window-container">
          <div class="caption-window">
            <span class="ytp-caption-segment">${options?.caption ?? 'First official caption'}</span>
          </div>
        </div>
      </div>
    </ytd-watch-flexy>
  `;

  const video = document.querySelector<HTMLVideoElement>('video')!;
  Object.defineProperties(video, {
    currentTime: { configurable: true, value: 65, writable: true },
    duration: { configurable: true, value: options?.duration ?? 300, writable: true },
    paused: { configurable: true, value: options?.paused ?? false, writable: true },
    seeking: { configurable: true, value: false, writable: true },
  });

  return {
    caption: document.querySelector<HTMLElement>('.ytp-caption-segment')!,
    captionsButton: document.querySelector<HTMLButtonElement>('.ytp-subtitles-button')!,
    player: document.querySelector<HTMLElement>('#movie_player')!,
    video,
  };
}

async function flushObservers() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe('YouTubeAdapter', () => {
  it('matches YouTube hosts and rejects lookalike hosts', () => {
    const adapter = new YouTubeAdapter();

    expect(adapter.matches(new URL('https://www.youtube.com/watch?v=abc'))).toBe(true);
    expect(adapter.matches(new URL('https://music.youtube.com/watch?v=abc'))).toBe(true);
    expect(adapter.matches(new URL('https://youtu.be/abc'))).toBe(true);
    expect(adapter.matches(new URL('https://youtube.com.example.test/watch?v=abc'))).toBe(false);
  });

  it('detects watch pages and formats playback timestamps', () => {
    expect(isYouTubeWatchPage(new URL('https://www.youtube.com/watch?v=abc'))).toBe(true);
    expect(isYouTubeWatchPage(new URL('https://www.youtube.com/'))).toBe(false);
    expect(isYouTubeWatchPage(new URL('https://www.youtube.com/watch'))).toBe(false);
    expect(isYouTubeWatchPage(new URL('https://www.youtube.com/shorts/abc'))).toBe(true);
    expect(formatPlaybackTimestamp(65, false)).toBe('01:05');
    expect(formatPlaybackTimestamp(3661, true)).toBe('LIVE · 01:01:01');
  });
});

describe('YouTubeCaptionSession', () => {
  let stopSession: (() => void) | null = null;

  beforeEach(() => {
    window.history.replaceState(null, '', '/watch?v=video-1');
    document.title = 'Fallback Title - YouTube';
  });

  afterEach(() => {
    stopSession?.();
    stopSession = null;
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.unstubAllGlobals();
  });

  function startSession(): {
    snapshots: YouTubeLiveSnapshot[];
    latest: () => YouTubeLiveSnapshot;
  } {
    const snapshots: YouTubeLiveSnapshot[] = [];
    const session = new YouTubeCaptionSession(
      document,
      window as unknown as Window & typeof globalThis,
    );
    stopSession = session.start((snapshot) => snapshots.push(snapshot));

    return {
      snapshots,
      latest: () => snapshots.at(-1)!,
    };
  }

  it('captures official captions as ContentPackets with video metadata', () => {
    renderYouTubePlayer();
    const { latest } = startSession();
    const snapshot = latest();

    expect(snapshot.status).toBe('playing');
    expect(snapshot.title).toBe('Test Video');
    expect(snapshot.timestamp).toBe('01:05');
    expect(snapshot.currentPacket).toMatchObject({
      platform: 'youtube',
      title: 'Test Video',
      timestamp: '01:05',
      text: 'First official caption',
      metadata: {
        channel: 'Test Channel',
        language: 'und',
        videoId: 'video-1',
        captionsEnabled: true,
        isAdvertisement: false,
        isLive: false,
        captionSource: 'youtube-dom',
        captionStartMs: 65_000,
        cueId: 'video-1:youtube-dom:65000:1',
        playbackTimeMs: 65_000,
        playbackState: 'playing',
      },
    });
    expect(snapshot.history).toHaveLength(1);
  });

  it('reads an official transcript track while the YouTube CC button remains off', async () => {
    const playerResponse = {
      videoDetails: { videoId: 'video-1' },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{
            baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=en',
            languageCode: 'en',
          }],
        },
      },
    };
    document.head.innerHTML = `<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      events: [{ tStartMs: 64_000, dDurationMs: 3_000, segs: [{ utf8: 'Transcript without visible captions' }] }],
    }), { status: 200 })));
    renderYouTubePlayer({ caption: '', captionsPressed: false });
    const { latest } = startSession();

    await flushObservers();
    await flushObservers();

    expect(latest().status).toBe('playing');
    expect(latest().metadata.captionsEnabled).toBe(false);
    expect(latest().currentPacket?.text).toBe('Transcript without visible captions');
    expect(latest().currentPacket?.metadata).toMatchObject({
      captionStartMs: 64_000,
      captionEndMs: 67_000,
      captionSource: 'youtube-track',
      playbackTimeMs: 65_000,
    });
    expect(latest().statusMessage).toContain('without displaying captions');
  });

  it('observes caption updates, suppresses duplicates, and keeps the last 10 entries', async () => {
    const { caption } = renderYouTubePlayer();
    const { latest } = startSession();

    caption.textContent = 'First official caption';
    await flushObservers();
    expect(latest().history).toHaveLength(1);

    for (let index = 2; index <= 12; index += 1) {
      caption.textContent = `Caption ${index}`;
      await flushObservers();
    }

    expect(latest().history).toHaveLength(10);
    expect(latest().history[0]?.text).toBe('Caption 3');
    expect(latest().history.at(-1)?.text).toBe('Caption 12');
  });

  it('updates partial text in place while retaining one timestamped cue', async () => {
    const { caption } = renderYouTubePlayer({ caption: 'A partial caption' });
    const { latest } = startSession();
    const cueId = latest().currentPacket?.metadata.cueId;

    caption.textContent = 'A partial caption grows smoothly';
    await flushObservers();

    expect(latest().history).toHaveLength(1);
    expect(latest().history[0]?.text).toBe('A partial caption grows smoothly');
    expect(latest().currentPacket?.metadata.cueId).toBe(cueId);
  });

  it('publishes source playback-rate changes for avatar synchronization', async () => {
    const { video } = renderYouTubePlayer();
    const { latest } = startSession();

    Object.defineProperty(video, 'playbackRate', {
      configurable: true,
      value: 1.75,
      writable: true,
    });
    video.dispatchEvent(new Event('ratechange'));
    await flushObservers();

    expect(latest().metadata.playbackRate).toBe(1.75);
  });

  it('reports disabled, unavailable, advertisement, paused, seeking, and live states', async () => {
    const { caption, captionsButton, player, video } = renderYouTubePlayer({
      caption: '',
      captionsPressed: false,
    });
    const { latest } = startSession();

    expect(latest().status).toBe('captions-disabled');

    captionsButton.disabled = true;
    captionsButton.setAttribute('aria-disabled', 'true');
    await flushObservers();
    expect(latest().status).toBe('no-captions');

    player.classList.add('ad-showing');
    await flushObservers();
    expect(latest().status).toBe('advertisement');
    expect(latest().currentPacket).toBeNull();

    player.classList.remove('ad-showing');
    captionsButton.disabled = false;
    captionsButton.removeAttribute('aria-disabled');
    captionsButton.setAttribute('aria-pressed', 'true');
    caption.textContent = 'Caption after advertisement';
    Object.defineProperty(video, 'paused', { configurable: true, value: true, writable: true });
    Object.defineProperty(video, 'duration', { configurable: true, value: Number.POSITIVE_INFINITY, writable: true });
    video.dispatchEvent(new Event('pause'));
    await flushObservers();

    expect(latest().status).toBe('paused');
    expect(latest().timestamp).toBe('LIVE · 01:05');
    expect(latest().metadata.isLive).toBe(true);

    Object.defineProperty(video, 'seeking', { configurable: true, value: true, writable: true });
    video.dispatchEvent(new Event('seeking'));
    await flushObservers();
    expect(latest().metadata.playbackState).toBe('seeking');
  });

  it('retains the last English caption for an existing playback result during caption gaps', async () => {
    const { caption, captionsButton } = renderYouTubePlayer();
    const { latest } = startSession();
    expect(resolveLiveSourceText(latest())).toBe('First official caption');

    caption.textContent = '';
    captionsButton.disabled = true;
    captionsButton.setAttribute('aria-disabled', 'true');
    await flushObservers();

    expect(latest().currentPacket).toBeNull();
    expect(resolveLiveSourceText(latest())).toBe('First official caption');
  });

  it('resets caption history after YouTube SPA navigation', async () => {
    const { caption } = renderYouTubePlayer();
    const { latest } = startSession();

    caption.textContent = 'Before navigation';
    await flushObservers();
    expect(latest().history.length).toBeGreaterThan(0);

    window.history.pushState(null, '', '/watch?v=video-2');
    document.querySelector('h1 yt-formatted-string')!.textContent = 'Second Video';
    caption.textContent = 'After navigation';
    window.dispatchEvent(new Event('yt-navigate-finish'));
    await flushObservers();

    expect(latest().metadata.videoId).toBe('video-2');
    expect(latest().title).toBe('Second Video');
    expect(latest().history).toHaveLength(1);
    expect(latest().history[0]?.text).toBe('After navigation');
  });

  it('reports a non-watch page without observing captions', () => {
    window.history.replaceState(null, '', '/');
    renderYouTubePlayer();
    const { latest } = startSession();

    expect(latest().status).toBe('not-watch-page');
    expect(latest().currentPacket).toBeNull();
  });
});
