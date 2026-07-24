import type { ContentPacket } from '../../shared/contentPacket';
import type { LiveContentSession, LiveContentStatus } from '../../shared/liveContent';
import type {
  YouTubeLiveSnapshot,
  YouTubePacketMetadata,
  YouTubePlaybackState,
} from '../../shared/youtube';
import { YOUTUBE_SELECTORS } from './youtubeSelectors';
import {
  formatPlaybackTimestamp,
  getChannelName,
  getVideoTitle,
  getYouTubeVideoId,
  isYouTubeWatchPage,
} from './youtubeUtils';
import {
  findYouTubeTranscriptTrackInDocument,
  loadYouTubeTranscript,
  transcriptCueAt,
  type YouTubeTranscriptCue,
} from './YouTubeTranscriptTrack';

const HISTORY_LIMIT = 10;
const VIDEO_EVENTS = [
  'play',
  'pause',
  'seeking',
  'seeked',
  'timeupdate',
  'loadedmetadata',
  'durationchange',
] as const;

function emptyMetadata(): YouTubePacketMetadata {
  return {
    channel: 'Unknown channel',
    language: 'und',
    videoId: '',
    captionsEnabled: false,
    isAdvertisement: false,
    isLive: false,
    playbackTimeMs: 0,
    playbackState: 'paused',
  };
}

function initialSnapshot(): YouTubeLiveSnapshot {
  return {
    status: 'loading',
    statusMessage: 'Connecting to the YouTube player…',
    title: 'YouTube',
    timestamp: '00:00',
    metadata: emptyMetadata(),
    currentPacket: null,
    history: [],
  };
}

export class YouTubeCaptionSession implements LiveContentSession<YouTubePacketMetadata> {
  private listener: ((snapshot: YouTubeLiveSnapshot) => void) | null = null;
  private snapshot: YouTubeLiveSnapshot = initialSnapshot();
  private playerObserver: MutationObserver | null = null;
  private metadataObserver: MutationObserver | null = null;
  private discoveryObserver: MutationObserver | null = null;
  private observedVideo: HTMLVideoElement | null = null;
  private readScheduled = false;
  private stopped = true;
  private transcriptAbort: AbortController | null = null;
  private transcriptCues: YouTubeTranscriptCue[] = [];
  private transcriptLanguage = 'und';
  private transcriptState: 'idle' | 'loading' | 'ready' | 'unavailable' = 'idle';
  private transcriptVideoId = '';
  private domCueSequence = 0;
  private domCueStartSeconds = 0;
  private domCueText = '';

  constructor(
    private readonly document: Document,
    private readonly window: Window & typeof globalThis,
  ) {}

  start(listener: (snapshot: YouTubeLiveSnapshot) => void): () => void {
    this.stop();
    this.listener = listener;
    this.stopped = false;
    this.snapshot = initialSnapshot();
    this.window.addEventListener('yt-navigate-finish', this.handleNavigation);
    this.window.addEventListener('popstate', this.handleNavigation);
    this.connectToPage();
    this.readAndEmit();

    return () => this.stop();
  }

  private readonly handleNavigation = () => {
    this.disconnectObservers();
    this.resetTranscript();
    this.resetDomCue(true);
    this.snapshot = initialSnapshot();
    this.connectToPage();
    this.readAndEmit();
  };

  private readonly handleVideoEvent = (event: Event) => {
    if (event.type === 'seeking' || event.type === 'seeked') this.resetDomCue();
    this.scheduleRead();
  };

  private connectToPage(): void {
    if (this.stopped || !isYouTubeWatchPage(new URL(this.window.location.href))) {
      return;
    }

    const player = this.document.querySelector(YOUTUBE_SELECTORS.player);
    if (!player) {
      this.observeForPlayer();
      return;
    }

    const playerObserver = new this.window.MutationObserver(() => this.scheduleRead());
    playerObserver.observe(player, {
      attributes: true,
      attributeFilter: ['aria-disabled', 'aria-pressed', 'class', 'disabled'],
      characterData: true,
      childList: true,
      subtree: true,
    });
    this.playerObserver = playerObserver;

    const metadataRoot = this.document.querySelector(YOUTUBE_SELECTORS.metadataRoot);
    if (metadataRoot) {
      const metadataObserver = new this.window.MutationObserver(() => this.scheduleRead());
      metadataObserver.observe(metadataRoot, {
        characterData: true,
        childList: true,
        subtree: true,
      });
      this.metadataObserver = metadataObserver;
    }

    this.attachVideo(this.document.querySelector<HTMLVideoElement>(YOUTUBE_SELECTORS.video));
  }

  private observeForPlayer(): void {
    if (!this.document.body || this.discoveryObserver) {
      return;
    }

    const discoveryObserver = new this.window.MutationObserver(() => {
      if (this.document.querySelector(YOUTUBE_SELECTORS.player)) {
        this.discoveryObserver?.disconnect();
        this.discoveryObserver = null;
        this.connectToPage();
        this.scheduleRead();
      }
    });
    discoveryObserver.observe(this.document.body, { childList: true, subtree: true });
    this.discoveryObserver = discoveryObserver;
  }

  private attachVideo(video: HTMLVideoElement | null): void {
    if (video === this.observedVideo) {
      return;
    }

    this.detachVideo();
    this.observedVideo = video;
    VIDEO_EVENTS.forEach((eventName) => video?.addEventListener(eventName, this.handleVideoEvent));
  }

  private detachVideo(): void {
    VIDEO_EVENTS.forEach((eventName) =>
      this.observedVideo?.removeEventListener(eventName, this.handleVideoEvent),
    );
    this.observedVideo = null;
  }

  private scheduleRead(): void {
    if (this.stopped || this.readScheduled) {
      return;
    }

    this.readScheduled = true;
    this.window.queueMicrotask(() => {
      this.readScheduled = false;
      this.attachVideo(this.document.querySelector<HTMLVideoElement>(YOUTUBE_SELECTORS.video));
      this.readAndEmit();
    });
  }

  private readAndEmit(): void {
    if (this.stopped) {
      return;
    }

    const url = new URL(this.window.location.href);
    if (!isYouTubeWatchPage(url)) {
      this.emit({
        ...initialSnapshot(),
        status: 'not-watch-page',
        statusMessage: 'Open a YouTube watch page to read live captions.',
        title: getVideoTitle(this.document),
      });
      return;
    }

    const video = this.document.querySelector<HTMLVideoElement>(YOUTUBE_SELECTORS.video);
    const player = this.document.querySelector(YOUTUBE_SELECTORS.player);
    const captionsButton = player?.querySelector<HTMLButtonElement>(YOUTUBE_SELECTORS.captionsButton) ?? null;
    const isAdvertisement = Boolean(player?.classList.contains('ad-showing'));
    const isLive = Boolean(
      video && (
        video.duration === Number.POSITIVE_INFINITY ||
        this.document.querySelector(YOUTUBE_SELECTORS.liveBadge)
      ),
    );
    const playbackState = this.getPlaybackState(video, isAdvertisement);
    const captionsEnabled = captionsButton?.getAttribute('aria-pressed') === 'true';
    const title = getVideoTitle(this.document);
    const channel = getChannelName(this.document);
    const videoId = getYouTubeVideoId(url);
    this.ensureTranscript(videoId);
    const playbackTimeSeconds = Math.max(0, video?.currentTime ?? 0);
    const timestamp = formatPlaybackTimestamp(playbackTimeSeconds, isLive);
    const transcriptCue = transcriptCueAt(this.transcriptCues, playbackTimeSeconds);
    const transcriptText = transcriptCue?.text ?? '';
    const domCaptionText = this.readCaptionText();
    this.updateDomCue(domCaptionText, playbackTimeSeconds);
    const captionText = domCaptionText || transcriptText;
    const captionSource = domCaptionText
      ? 'youtube-dom' as const
      : transcriptCue
        ? 'youtube-track' as const
        : undefined;
    const captionStartMs = domCaptionText
      ? Math.round(this.domCueStartSeconds * 1_000)
      : transcriptCue
        ? Math.round(transcriptCue.startSeconds * 1_000)
        : undefined;
    const captionEndMs = transcriptCue
      ? Math.round(transcriptCue.endSeconds * 1_000)
      : undefined;
    const metadata: YouTubePacketMetadata = {
      captionEndMs,
      captionSource,
      captionStartMs,
      channel,
      cueId: captionText && captionSource && captionStartMs !== undefined
        ? `${videoId}:${captionSource}:${captionStartMs}${
            captionSource === 'youtube-dom' ? `:${this.domCueSequence}` : ''
          }`
        : undefined,
      language: this.document.querySelector(YOUTUBE_SELECTORS.captionSegments)?.getAttribute('lang') ||
        (transcriptText ? this.transcriptLanguage : '') ||
        this.document.documentElement.lang || 'und',
      videoId,
      captionsEnabled,
      isAdvertisement,
      isLive,
      playbackTimeMs: Math.round(playbackTimeSeconds * 1_000),
      playbackState,
    };

    if (!player || !video) {
      this.emit({
        ...this.snapshot,
        status: 'loading',
        statusMessage: 'Waiting for the YouTube player…',
        title,
        timestamp,
        metadata,
      });
      return;
    }

    if (isAdvertisement) {
      this.emit({
        ...this.snapshot,
        status: 'advertisement',
        statusMessage: 'Advertisement playing. Caption capture is paused.',
        title,
        timestamp,
        metadata,
        currentPacket: null,
      });
      return;
    }

    const captionUnavailable =
      !captionsButton ||
      captionsButton.disabled ||
      captionsButton.getAttribute('aria-disabled') === 'true';

    if (!captionText && this.transcriptState === 'loading') {
      this.emit({
        ...this.snapshot,
        status: 'loading',
        statusMessage: 'Loading the available YouTube transcript…',
        title,
        timestamp,
        metadata,
        currentPacket: null,
      });
      return;
    }

    if (!captionText && captionUnavailable) {
      this.emit({
        ...this.snapshot,
        status: 'no-captions',
        statusMessage: 'No transcript is available. Preparing video-audio transcription…',
        title,
        timestamp,
        metadata,
        currentPacket: null,
      });
      return;
    }

    if (!captionText && !captionsEnabled) {
      this.emit({
        ...this.snapshot,
        status: 'captions-disabled',
        statusMessage: this.transcriptState === 'ready'
          ? 'Waiting for the next transcript segment…'
          : 'Waiting briefly before using video-audio transcription…',
        title,
        timestamp,
        metadata,
        currentPacket: null,
      });
      return;
    }

    const status: LiveContentStatus = video.paused ? 'paused' : 'playing';
    const activeText = captionText || this.snapshot.currentPacket?.text || '';
    const packet = activeText
      ? this.createPacket(title, timestamp, activeText, metadata)
      : null;
    const history = captionText
      ? this.appendHistory(this.snapshot.history, this.createPacket(title, timestamp, captionText, metadata))
      : this.snapshot.history;

    this.emit({
      status,
      statusMessage: video.paused
        ? 'Video paused. Captions will resume with playback.'
        : captionText
          ? domCaptionText
            ? 'Reading official YouTube captions.'
            : 'Reading the YouTube transcript without displaying captions.'
          : 'Waiting for the next caption…',
      title,
      timestamp,
      metadata,
      currentPacket: packet,
      history,
    });
  }

  private readCaptionText(): string {
    return Array.from(this.document.querySelectorAll(YOUTUBE_SELECTORS.captionSegments))
      .map((segment) => segment.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private updateDomCue(text: string, playbackTimeSeconds: number): void {
    if (!text) {
      this.resetDomCue();
      return;
    }
    if (!this.domCueText || !text.startsWith(this.domCueText)) {
      this.domCueStartSeconds = playbackTimeSeconds;
      this.domCueSequence += 1;
    }
    this.domCueText = text;
  }

  private resetDomCue(resetSequence = false): void {
    this.domCueStartSeconds = 0;
    this.domCueText = '';
    if (resetSequence) this.domCueSequence = 0;
  }

  private ensureTranscript(videoId: string): void {
    if (!videoId || this.transcriptVideoId === videoId) return;
    this.resetTranscript();
    this.transcriptVideoId = videoId;
    const track = findYouTubeTranscriptTrackInDocument(this.document, videoId);
    if (!track) {
      this.transcriptState = 'unavailable';
      return;
    }
    this.transcriptState = 'loading';
    this.transcriptLanguage = track.language;
    const abort = new AbortController();
    this.transcriptAbort = abort;
    void loadYouTubeTranscript(track, abort.signal)
      .then((cues) => {
        if (abort.signal.aborted || this.transcriptVideoId !== videoId) return;
        this.transcriptCues = cues;
        this.transcriptState = cues.length > 0 ? 'ready' : 'unavailable';
        this.scheduleRead();
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        console.warn('[SignVerse] youtube_transcript_unavailable', error);
        this.transcriptState = 'unavailable';
        this.scheduleRead();
      });
  }

  private resetTranscript(): void {
    this.transcriptAbort?.abort();
    this.transcriptAbort = null;
    this.transcriptCues = [];
    this.transcriptLanguage = 'und';
    this.transcriptState = 'idle';
    this.transcriptVideoId = '';
  }

  private getPlaybackState(
    video: HTMLVideoElement | null,
    isAdvertisement: boolean,
  ): YouTubePlaybackState {
    if (isAdvertisement) {
      return 'advertisement';
    }
    if (video?.seeking) {
      return 'seeking';
    }
    return video && !video.paused ? 'playing' : 'paused';
  }

  private createPacket(
    title: string,
    timestamp: string,
    text: string,
    metadata: YouTubePacketMetadata,
  ): ContentPacket<YouTubePacketMetadata> {
    return {
      platform: 'youtube',
      title,
      timestamp,
      text,
      metadata,
    };
  }

  private appendHistory(
    history: ContentPacket<YouTubePacketMetadata>[],
    packet: ContentPacket<YouTubePacketMetadata>,
  ): ContentPacket<YouTubePacketMetadata>[] {
    const last = history.at(-1);
    if (
      last?.metadata.cueId &&
      packet.metadata.cueId &&
      last.metadata.cueId === packet.metadata.cueId
    ) {
      return [...history.slice(0, -1), packet];
    }
    if (
      !last?.metadata.cueId &&
      last?.text === packet.text &&
      last.metadata.videoId === packet.metadata.videoId
    ) return history;

    return [...history, packet].slice(-HISTORY_LIMIT);
  }

  private emit(snapshot: YouTubeLiveSnapshot): void {
    this.snapshot = snapshot;
    this.listener?.(snapshot);
  }

  private disconnectObservers(): void {
    this.playerObserver?.disconnect();
    this.metadataObserver?.disconnect();
    this.discoveryObserver?.disconnect();
    this.playerObserver = null;
    this.metadataObserver = null;
    this.discoveryObserver = null;
    this.detachVideo();
  }

  private stop(): void {
    this.stopped = true;
    this.disconnectObservers();
    this.resetTranscript();
    this.resetDomCue(true);
    this.window.removeEventListener('yt-navigate-finish', this.handleNavigation);
    this.window.removeEventListener('popstate', this.handleNavigation);
    this.listener = null;
    this.readScheduled = false;
  }
}
