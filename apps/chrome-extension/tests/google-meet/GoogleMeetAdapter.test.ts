import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GoogleMeetAdapter } from '../../content/google-meet/GoogleMeetAdapter';
import { GoogleMeetCaptionSession } from '../../content/google-meet/GoogleMeetCaptionSession';
import { getMeetingId, isGoogleMeetSession } from '../../content/google-meet/googleMeetUtils';
import type { GoogleMeetLiveSnapshot } from '../../shared/googleMeet';

const FIXED_TIME = new Date('2026-07-15T10:20:30');

function renderMeeting(options?: { captionsPressed?: boolean; caption?: string; speaker?: string }) {
  document.body.innerHTML = `
    <header><h1 data-meeting-title>Accessibility Stand-up</h1></header>
    <button data-is-caption-button aria-label="Turn off captions" aria-pressed="${options?.captionsPressed ?? true}"></button>
    <main>
      <div aria-live="polite" role="region" lang="en-IN">
        <div data-caption-row data-participant-id="speaker-1">
          <span data-speaker-name>${options?.speaker ?? 'Asha'}</span>
          <span data-caption-text>${options?.caption ?? 'Welcome to the meeting'}</span>
        </div>
      </div>
      <div role="listitem" data-participant-id="participant-1" data-participant-type="remote"></div>
      <div role="listitem" data-participant-id="participant-2" data-participant-type="remote"></div>
    </main>
  `;

  return {
    caption: document.querySelector<HTMLElement>('[data-caption-text]')!,
    row: document.querySelector<HTMLElement>('[data-caption-row]')!,
    speaker: document.querySelector<HTMLElement>('[data-speaker-name]')!,
    button: document.querySelector<HTMLButtonElement>('[data-is-caption-button]')!,
    region: document.querySelector<HTMLElement>('[aria-live="polite"]')!,
  };
}

async function flushObservers() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe('GoogleMeetAdapter', () => {
  it('matches only the Google Meet host and identifies session routes', () => {
    const adapter = new GoogleMeetAdapter();

    expect(adapter.matches(new URL('https://meet.google.com/abc-defg-hij'))).toBe(true);
    expect(adapter.matches(new URL('https://meet.google.com.example.test/abc-defg-hij'))).toBe(false);
    expect(isGoogleMeetSession(new URL('https://meet.google.com/abc-defg-hij'))).toBe(true);
    expect(isGoogleMeetSession(new URL('https://meet.google.com/'))).toBe(false);
    expect(getMeetingId(new URL('https://meet.google.com/lookup/team-room'))).toBe('lookup/team-room');
  });
});

describe('GoogleMeetCaptionSession', () => {
  let stopSession: (() => void) | null = null;

  beforeEach(() => {
    window.history.replaceState(null, '', '/abc-defg-hij');
    document.title = 'Google Meet';
  });

  afterEach(() => {
    stopSession?.();
    stopSession = null;
    document.body.innerHTML = '';
  });

  function startSession() {
    const snapshots: GoogleMeetLiveSnapshot[] = [];
    const session = new GoogleMeetCaptionSession(
      document,
      window as unknown as Window & typeof globalThis,
      () => FIXED_TIME,
    );
    stopSession = session.start((snapshot) => snapshots.push(snapshot));

    return { latest: () => snapshots.at(-1)!, snapshots };
  }

  it('creates unified ContentPackets with speaker and meeting metadata', () => {
    renderMeeting();
    const { latest } = startSession();

    expect(latest().status).toBe('connected');
    expect(latest().title).toBe('Accessibility Stand-up');
    expect(latest().currentPacket).toEqual({
      platform: 'google-meet',
      title: 'Accessibility Stand-up',
      speaker: 'Asha',
      timestamp: '10:20:30',
      text: 'Welcome to the meeting',
      metadata: {
        meetingId: 'abc-defg-hij',
        language: 'en-IN',
        captionsEnabled: true,
        participantCount: 2,
        connectionState: 'connected',
      },
    });
  });

  it('updates partial captions in place and starts history entries on speaker changes', async () => {
    const { caption, speaker } = renderMeeting();
    const { latest } = startSession();

    caption.textContent = 'Welcome to the meeting everyone';
    await flushObservers();
    expect(latest().history).toHaveLength(1);
    expect(latest().history[0]?.text).toBe('Welcome to the meeting everyone');

    speaker.textContent = 'Ravi';
    caption.textContent = 'Thanks Asha';
    await flushObservers();
    expect(latest().history).toHaveLength(2);
    expect(latest().history.at(-1)?.speaker).toBe('Ravi');
  });

  it('reports disabled captions, interruptions, and reconnect recovery', async () => {
    const { button, region } = renderMeeting({ caption: '' });
    const { latest } = startSession();

    button.setAttribute('aria-pressed', 'false');
    await flushObservers();
    expect(latest().status).toBe('captions-disabled');

    button.setAttribute('aria-pressed', 'true');
    region.innerHTML = `
      <div data-caption-row><span data-speaker-name>Asha</span><span data-caption-text>Back online</span></div>
    `;
    await flushObservers();
    expect(latest().status).toBe('connected');

    region.innerHTML = '';
    await flushObservers();
    expect(latest().status).toBe('interrupted');
    expect(latest().history.at(-1)?.text).toBe('Back online');

    document.body.insertAdjacentHTML('beforeend', '<div id="reconnect-state" role="status">Trying to reconnect</div>');
    await flushObservers();
    expect(latest().status).toBe('reconnecting');
    expect(latest().history).toHaveLength(1);

    document.querySelector('#reconnect-state')?.remove();
    region.innerHTML = `
      <div data-caption-row><span data-speaker-name>Ravi</span><span data-caption-text>Connection restored</span></div>
    `;
    await flushObservers();
    expect(latest().status).toBe('connected');
    expect(latest().history.at(-1)?.text).toBe('Connection restored');
  });

  it('handles participant changes and bounds completed caption history to 10 entries', async () => {
    const { region } = renderMeeting();
    const { latest } = startSession();

    for (let index = 2; index <= 12; index += 1) {
      region.innerHTML = `
        <div data-caption-row data-participant-id="speaker-${index}">
          <span data-speaker-name>Speaker ${index}</span>
          <span data-caption-text>Caption ${index}</span>
        </div>
      `;
      await flushObservers();
    }

    expect(latest().history).toHaveLength(10);
    expect(latest().history[0]?.text).toBe('Caption 3');
    expect(latest().history.at(-1)?.text).toBe('Caption 12');

    document.querySelector('[data-participant-id="participant-2"]')?.remove();
    await flushObservers();
    expect(latest().metadata.participantCount).toBe(1);
  });

  it('reports the Meet landing page as outside a live session', () => {
    window.history.replaceState(null, '', '/');
    renderMeeting();
    const { latest } = startSession();

    expect(latest().status).toBe('not-in-session');
    expect(latest().currentPacket).toBeNull();
  });
});
