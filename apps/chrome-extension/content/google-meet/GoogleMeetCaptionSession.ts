import type { ContentPacket } from '../../shared/contentPacket';
import type { GoogleMeetLiveSnapshot, GoogleMeetPacketMetadata } from '../../shared/googleMeet';
import type { LiveContentSession } from '../../shared/liveContent';
import { GOOGLE_MEET_SELECTORS } from './googleMeetSelectors';
import {
  formatMeetingTimestamp,
  getMeetingId,
  getMeetingTitle,
} from './googleMeetUtils';

const HISTORY_LIMIT = 10;

interface CaptionCandidate {
  root: Element;
  speaker: string;
  text: string;
  language: string;
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function initialMetadata(): GoogleMeetPacketMetadata {
  return {
    meetingId: '',
    language: 'und',
    captionsEnabled: false,
    participantCount: null,
    connectionState: 'not-in-session',
  };
}

function initialSnapshot(): GoogleMeetLiveSnapshot {
  return {
    status: 'loading',
    statusMessage: 'Connecting to Google Meet…',
    title: 'Google Meet',
    timestamp: '--:--:--',
    metadata: initialMetadata(),
    currentPacket: null,
    history: [],
  };
}

export class GoogleMeetCaptionSession implements LiveContentSession<GoogleMeetPacketMetadata> {
  private listener: ((snapshot: GoogleMeetLiveSnapshot) => void) | null = null;
  private snapshot = initialSnapshot();
  private observer: MutationObserver | null = null;
  private readScheduled = false;
  private stopped = true;
  private lastCaptionRoot: Element | null = null;
  private captionInterrupted = false;

  constructor(
    private readonly document: Document,
    private readonly window: Window & typeof globalThis,
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(listener: (snapshot: GoogleMeetLiveSnapshot) => void): () => void {
    this.stop();
    this.listener = listener;
    this.stopped = false;
    this.snapshot = initialSnapshot();
    this.window.addEventListener('popstate', this.handleNavigation);
    this.window.addEventListener('hashchange', this.handleNavigation);
    this.document.addEventListener('visibilitychange', this.handleDocumentState);
    this.connectObserver();
    this.readAndEmit();

    return () => this.stop();
  }

  private readonly handleNavigation = () => {
    this.snapshot = initialSnapshot();
    this.lastCaptionRoot = null;
    this.captionInterrupted = false;
    this.scheduleRead();
  };

  private readonly handleDocumentState = () => this.scheduleRead();

  private connectObserver(): void {
    if (!this.document.body) {
      return;
    }

    this.observer = new this.window.MutationObserver(() => this.scheduleRead());
    this.observer.observe(this.document.body, {
      attributes: true,
      attributeFilter: ['aria-label', 'aria-pressed', 'data-call-state', 'lang'],
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  private scheduleRead(): void {
    if (this.stopped || this.readScheduled) {
      return;
    }

    this.readScheduled = true;
    this.window.queueMicrotask(() => {
      this.readScheduled = false;
      this.readAndEmit();
    });
  }

  private readAndEmit(): void {
    if (this.stopped) {
      return;
    }

    const url = new URL(this.window.location.href);
    const timestamp = formatMeetingTimestamp(this.now());
    const title = getMeetingTitle(this.document);
    const meetingId = getMeetingId(url);
    const participantCount = this.getParticipantCount();

    // The AdapterFactory has already verified the host. Keeping session detection
    // path-based also supports Meet's client-side navigation without recreating the adapter.
    if (!meetingId) {
      this.emit({
        ...initialSnapshot(),
        status: 'not-in-session',
        statusMessage: 'Join a Google Meet session to read live captions.',
        title,
        timestamp,
      });
      return;
    }

    const candidate = this.readCaptionCandidate();
    const captionsButton = this.document.querySelector<HTMLElement>(
      GOOGLE_MEET_SELECTORS.captionsButton,
    );
    const captionsExplicitlyDisabled = captionsButton?.getAttribute('aria-pressed') === 'false';
    const captionsEnabled = Boolean(candidate) || captionsButton?.getAttribute('aria-pressed') === 'true';
    const reconnecting = this.isReconnecting();
    const language = candidate?.language || this.snapshot.metadata.language || 'und';

    if (reconnecting) {
      this.captionInterrupted = true;
      this.emit({
        ...this.snapshot,
        status: 'reconnecting',
        statusMessage: 'Meeting is reconnecting. Caption history is preserved.',
        title,
        timestamp,
        metadata: {
          meetingId,
          language,
          captionsEnabled,
          participantCount,
          connectionState: 'reconnecting',
        },
      });
      return;
    }

    if (captionsExplicitlyDisabled || (!captionsButton && !candidate && !this.snapshot.currentPacket)) {
      this.emit({
        ...this.snapshot,
        status: 'captions-disabled',
        statusMessage: 'Turn on Google Meet captions to begin extraction.',
        title,
        timestamp,
        metadata: {
          meetingId,
          language,
          captionsEnabled: false,
          participantCount,
          connectionState: 'connected',
        },
        currentPacket: null,
      });
      return;
    }

    if (!candidate) {
      this.captionInterrupted = Boolean(this.snapshot.currentPacket);
      this.emit({
        ...this.snapshot,
        status: this.captionInterrupted ? 'interrupted' : 'connected',
        statusMessage: this.captionInterrupted
          ? 'Caption stream interrupted. Waiting for it to resume.'
          : 'Captions are on. Waiting for someone to speak…',
        title,
        timestamp,
        metadata: {
          meetingId,
          language,
          captionsEnabled,
          participantCount,
          connectionState: this.captionInterrupted ? 'interrupted' : 'connected',
        },
      });
      return;
    }

    const metadata: GoogleMeetPacketMetadata = {
      meetingId,
      language: candidate.language,
      captionsEnabled: true,
      participantCount,
      connectionState: 'connected',
    };
    const packet = this.createPacket(title, timestamp, candidate, metadata);
    const beginsNewEntry =
      this.captionInterrupted ||
      this.lastCaptionRoot !== candidate.root ||
      this.snapshot.currentPacket?.speaker !== candidate.speaker;
    const history = this.updateHistory(this.snapshot.history, packet, beginsNewEntry);

    this.lastCaptionRoot = candidate.root;
    this.captionInterrupted = false;
    this.emit({
      status: 'connected',
      statusMessage: 'Reading live Google Meet captions.',
      title,
      timestamp,
      metadata,
      currentPacket: packet,
      history,
    });
  }

  private readCaptionCandidate(): CaptionCandidate | null {
    const regions = Array.from(
      this.document.querySelectorAll(GOOGLE_MEET_SELECTORS.captionRegions),
    );

    for (const region of regions.reverse()) {
      const rows = Array.from(region.querySelectorAll(GOOGLE_MEET_SELECTORS.captionRows));
      const candidates = rows.length > 0 ? rows : [region];

      for (const root of candidates.reverse()) {
        const speakerElement = root.querySelector(GOOGLE_MEET_SELECTORS.speaker);
        const textElement = root.querySelector(GOOGLE_MEET_SELECTORS.captionText);
        const speaker = normalizeText(speakerElement?.textContent) || 'Unknown speaker';
        let text = normalizeText(textElement?.textContent);

        if (!text) {
          const clone = root.cloneNode(true) as Element;
          clone.querySelectorAll(GOOGLE_MEET_SELECTORS.speaker).forEach((element) => element.remove());
          clone.querySelectorAll('button, [role="button"]').forEach((element) => element.remove());
          text = normalizeText(clone.textContent);
        }

        if (text) {
          return {
            root,
            speaker,
            text,
            language:
              textElement?.getAttribute('lang') ||
              root.getAttribute('lang') ||
              region.getAttribute('lang') ||
              this.document.documentElement.lang ||
              'und',
          };
        }
      }
    }

    return null;
  }

  private getParticipantCount(): number | null {
    const participants = this.document.querySelectorAll(GOOGLE_MEET_SELECTORS.participant);
    return participants.length > 0 ? participants.length : null;
  }

  private isReconnecting(): boolean {
    if (this.document.querySelector(GOOGLE_MEET_SELECTORS.reconnecting)) {
      return true;
    }

    return Array.from(this.document.querySelectorAll(GOOGLE_MEET_SELECTORS.status)).some((element) =>
      /reconnect|connection lost|trying to connect/i.test(normalizeText(element.textContent)),
    );
  }

  private createPacket(
    title: string,
    timestamp: string,
    candidate: CaptionCandidate,
    metadata: GoogleMeetPacketMetadata,
  ): ContentPacket<GoogleMeetPacketMetadata> {
    return {
      platform: 'google-meet',
      title,
      speaker: candidate.speaker,
      timestamp,
      text: candidate.text,
      metadata,
    };
  }

  private updateHistory(
    history: ContentPacket<GoogleMeetPacketMetadata>[],
    packet: ContentPacket<GoogleMeetPacketMetadata>,
    beginsNewEntry: boolean,
  ): ContentPacket<GoogleMeetPacketMetadata>[] {
    if (beginsNewEntry || history.length === 0) {
      return [...history, packet].slice(-HISTORY_LIMIT);
    }

    return [...history.slice(0, -1), packet];
  }

  private emit(snapshot: GoogleMeetLiveSnapshot): void {
    this.snapshot = snapshot;
    this.listener?.(snapshot);
  }

  private stop(): void {
    this.stopped = true;
    this.observer?.disconnect();
    this.observer = null;
    this.window.removeEventListener('popstate', this.handleNavigation);
    this.window.removeEventListener('hashchange', this.handleNavigation);
    this.document.removeEventListener('visibilitychange', this.handleDocumentState);
    this.listener = null;
    this.readScheduled = false;
  }
}
