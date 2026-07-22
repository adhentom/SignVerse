import { GOOGLE_MEET_SELECTORS } from './googleMeetSelectors';

const STANDARD_MEETING_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i;

export function getMeetingId(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean);
  const standardCode = segments.find((segment) => STANDARD_MEETING_CODE.test(segment));

  if (standardCode) {
    return standardCode.toLowerCase();
  }

  if (segments[0] === 'lookup' && segments[1]) {
    return `lookup/${segments[1]}`;
  }

  return '';
}

export function isGoogleMeetSession(url: URL): boolean {
  return url.hostname.toLowerCase() === 'meet.google.com' && Boolean(getMeetingId(url));
}

export function getMeetingTitle(document: Document): string {
  const titleElement = document.querySelector(GOOGLE_MEET_SELECTORS.meetingTitle);
  const ariaLabel = titleElement?.getAttribute('aria-label')?.replace(/^Meeting name:\s*/i, '');
  const visibleTitle = ariaLabel || titleElement?.textContent;

  if (visibleTitle?.trim()) {
    return visibleTitle.replace(/\s+/g, ' ').trim();
  }

  const documentTitle = document.title.replace(/\s*[|-]\s*Google Meet\s*$/i, '').trim();
  return documentTitle && documentTitle !== 'Google Meet' ? documentTitle : 'Google Meet';
}

export function formatMeetingTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
