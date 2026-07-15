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
    videoId: '',
    captionsEnabled: false,
    isAdvertisement: false,
    isLive: false,
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
    this.snapshot = initialSnapshot();
    this.connectToPage();
    this.readAndEmit();
  };

  private readonly handleVideoEvent = () => {
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
    const timestamp = formatPlaybackTimestamp(video?.currentTime ?? 0, isLive);
    const metadata: YouTubePacketMetadata = {
      channel,
      videoId,
      captionsEnabled,
      isAdvertisement,
      isLive,
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

    const captionText = this.readCaptionText();
    const captionUnavailable =
      !captionsButton ||
      captionsButton.disabled ||
      captionsButton.getAttribute('aria-disabled') === 'true';

    if (!captionText && captionUnavailable) {
      this.emit({
        ...this.snapshot,
        status: 'no-captions',
        statusMessage: 'No official captions are available for this video.',
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
        statusMessage: 'Turn on YouTube captions to begin extraction.',
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
          ? 'Reading official YouTube captions.'
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
      last?.text === packet.text &&
      last.metadata.videoId === packet.metadata.videoId
    ) {
      return history;
    }

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
    this.window.removeEventListener('yt-navigate-finish', this.handleNavigation);
    this.window.removeEventListener('popstate', this.handleNavigation);
    this.listener = null;
    this.readScheduled = false;
  }
}
