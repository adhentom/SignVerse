import { YOUTUBE_SELECTORS } from './youtubeSelectors';

export function isYouTubeHost(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase();
  return (
    normalized === 'youtube.com' ||
    normalized === 'youtu.be' ||
    normalized.endsWith('.youtube.com')
  );
}

export function isYouTubeWatchPage(url: URL): boolean {
  return (
    isYouTubeHost(url.hostname) &&
    url.pathname === '/watch' &&
    Boolean(url.searchParams.get('v'))
  );
}

export function getYouTubeVideoId(url: URL): string {
  if (url.hostname.toLocaleLowerCase() === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] ?? '';
  }

  return url.searchParams.get('v') ?? '';
}

export function formatPlaybackTimestamp(seconds: number, isLive: boolean): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const clock = hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;

  return isLive ? `LIVE · ${clock}` : clock;
}

export function readElementValue(element: Element | null): string {
  if (!element) {
    return '';
  }

  if (element instanceof HTMLMetaElement) {
    return element.content.trim();
  }

  return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function queryFirstValue(document: Document, selectors: readonly string[]): string {
  for (const selector of selectors) {
    const value = readElementValue(document.querySelector(selector));
    if (value) {
      return value;
    }
  }

  return '';
}

export function getVideoTitle(document: Document): string {
  const detected = queryFirstValue(document, YOUTUBE_SELECTORS.title);
  if (detected) {
    return detected;
  }

  return document.title.replace(/\s+-\s+YouTube\s*$/i, '').trim() || 'Untitled YouTube video';
}

export function getChannelName(document: Document): string {
  return queryFirstValue(document, YOUTUBE_SELECTORS.channel) || 'Unknown channel';
}
