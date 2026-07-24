export interface YouTubeTranscriptCue {
  endSeconds: number;
  startSeconds: number;
  text: string;
}

export interface YouTubeTranscriptTrack {
  baseUrl: string;
  language: string;
}

interface PlayerCaptionTrack {
  baseUrl?: unknown;
  languageCode?: unknown;
}

interface PlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: PlayerCaptionTrack[];
    };
  };
  videoDetails?: { videoId?: unknown };
}

function assignedJson(source: string): PlayerResponse | null {
  const marker = 'ytInitialPlayerResponse';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = source.indexOf('{', markerIndex + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let escaped = false;
  let quoted = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) {
      try {
        return JSON.parse(source.slice(start, index + 1)) as PlayerResponse;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function findYouTubeTranscriptTrack(
  source: string,
  videoId: string,
): YouTubeTranscriptTrack | null {
  const response = assignedJson(source);
  if (!response) return null;
  const responseVideoId = response.videoDetails?.videoId;
  if (typeof responseVideoId === 'string' && responseVideoId !== videoId) return null;
  const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const selected = tracks.find((track) => (
    typeof track.languageCode === 'string' && track.languageCode.toLowerCase().startsWith('en')
  )) ?? tracks[0];
  if (!selected || typeof selected.baseUrl !== 'string' || !selected.baseUrl.startsWith('https://')) {
    return null;
  }
  return {
    baseUrl: selected.baseUrl,
    language: typeof selected.languageCode === 'string' ? selected.languageCode : 'und',
  };
}

export function findYouTubeTranscriptTrackInDocument(
  document: Document,
  videoId: string,
): YouTubeTranscriptTrack | null {
  for (const script of document.scripts) {
    const source = script.textContent ?? '';
    if (!source.includes('ytInitialPlayerResponse')) continue;
    const track = findYouTubeTranscriptTrack(source, videoId);
    if (track) return track;
  }
  return null;
}

export function parseYouTubeTranscript(payload: unknown): YouTubeTranscriptCue[] {
  if (!payload || typeof payload !== 'object' || !('events' in payload)) return [];
  const events = (payload as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];
  return events.flatMap((event): YouTubeTranscriptCue[] => {
    if (!event || typeof event !== 'object') return [];
    const candidate = event as { dDurationMs?: unknown; segs?: unknown; tStartMs?: unknown };
    if (!Array.isArray(candidate.segs) || typeof candidate.tStartMs !== 'number') return [];
    const text = candidate.segs
      .map((segment) => (
        segment && typeof segment === 'object' && 'utf8' in segment &&
          typeof (segment as { utf8?: unknown }).utf8 === 'string'
          ? (segment as { utf8: string }).utf8
          : ''
      ))
      .join('')
      .replace(/\s+/gu, ' ')
      .trim();
    if (!text) return [];
    const startSeconds = Math.max(0, candidate.tStartMs / 1_000);
    const durationSeconds = typeof candidate.dDurationMs === 'number'
      ? Math.max(0.1, candidate.dDurationMs / 1_000)
      : 5;
    return [{ startSeconds, endSeconds: startSeconds + durationSeconds, text }];
  });
}

function textFromElement(element: Element): string {
  return element.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
}

function parseYouTubeTranscriptXml(payload: string): YouTubeTranscriptCue[] {
  const document = new DOMParser().parseFromString(payload, 'text/xml');
  if (document.querySelector('parsererror')) return [];

  const legacyCues = Array.from(document.querySelectorAll('transcript > text')).flatMap(
    (element): YouTubeTranscriptCue[] => {
      const startSeconds = Number(element.getAttribute('start'));
      const durationSeconds = Number(element.getAttribute('dur'));
      const text = textFromElement(element);
      if (!Number.isFinite(startSeconds) || !text) return [];
      const duration = Number.isFinite(durationSeconds) ? Math.max(0.1, durationSeconds) : 5;
      return [{
        startSeconds: Math.max(0, startSeconds),
        endSeconds: Math.max(0, startSeconds) + duration,
        text,
      }];
    },
  );
  if (legacyCues.length > 0) return legacyCues;

  return Array.from(document.querySelectorAll('timedtext body p')).flatMap(
    (element): YouTubeTranscriptCue[] => {
      const startMilliseconds = Number(element.getAttribute('t'));
      const durationMilliseconds = Number(element.getAttribute('d'));
      const text = textFromElement(element);
      if (!Number.isFinite(startMilliseconds) || !text) return [];
      const startSeconds = Math.max(0, startMilliseconds / 1_000);
      const durationSeconds = Number.isFinite(durationMilliseconds)
        ? Math.max(0.1, durationMilliseconds / 1_000)
        : 5;
      return [{ startSeconds, endSeconds: startSeconds + durationSeconds, text }];
    },
  );
}

/**
 * Parses the JSON3 and XML/SRV3 formats returned by YouTube caption tracks.
 */
export function parseYouTubeTranscriptResponse(payload: string): YouTubeTranscriptCue[] {
  const body = payload.trim();
  if (!body) return [];

  if (body.startsWith('<')) {
    return parseYouTubeTranscriptXml(body);
  }

  try {
    return parseYouTubeTranscript(JSON.parse(body) as unknown);
  } catch {
    return [];
  }
}

export async function loadYouTubeTranscript(
  track: YouTubeTranscriptTrack,
  signal: AbortSignal,
): Promise<YouTubeTranscriptCue[]> {
  const response = await fetch(track.baseUrl, { credentials: 'include', signal });
  if (!response.ok) throw new Error(`YouTube transcript request failed with HTTP ${response.status}.`);
  return parseYouTubeTranscriptResponse(await response.text());
}

export function transcriptCueAt(
  cues: YouTubeTranscriptCue[],
  timeSeconds: number,
): YouTubeTranscriptCue | null {
  return cues.find((cue) => timeSeconds >= cue.startSeconds && timeSeconds < cue.endSeconds) ?? null;
}
