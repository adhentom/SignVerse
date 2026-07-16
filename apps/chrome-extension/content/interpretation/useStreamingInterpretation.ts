import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentPacket } from '../../shared/contentPacket';
import type { InterpretationErrorCode, InterpretationResponse, InterpretationState } from '../../shared/interpretation';
import { requestInterpretation } from './requestInterpretation';
import { segmentText } from './sentenceSegmentation';

interface RequestError { code?: InterpretationErrorCode; message?: string }

function sourceIdentity(packet: ContentPacket): string {
  const metadata = packet.metadata as Record<string, unknown>;
  return `${packet.platform}:${metadata.videoId ?? metadata.meetingId ?? metadata.pageUrl ?? packet.title}`;
}

export function segmentIdentity(packet: ContentPacket, text = packet.text): string {
  const metadata = packet.metadata as Record<string, unknown>;
  return `${sourceIdentity(packet)}:${metadata.language ?? ''}:${packet.speaker ?? ''}:${text}`;
}

export function mergeInterpretations(
  current: InterpretationResponse | null,
  next: InterpretationResponse,
): InterpretationResponse {
  if (!current) return next;
  return {
    summary: next.summary || current.summary,
    malayalam_translation: [current.malayalam_translation, next.malayalam_translation].filter(Boolean).slice(-6).join('\n'),
    key_points: [...current.key_points, ...next.key_points].slice(-12),
    keywords: [...new Set([...current.keywords, ...next.keywords])].slice(-20),
    glossary: [...new Set([...current.glossary, ...next.glossary])].slice(-20),
    isl_gloss: [...current.isl_gloss, ...next.isl_gloss].slice(-200),
    confidence: next.confidence,
    playback: {
      items: [...(current.playback?.items ?? []), ...(next.playback?.items ?? [])].slice(-200),
      unsupported_tokens: [...new Set([
        ...(current.playback?.unsupported_tokens ?? []),
        ...(next.playback?.unsupported_tokens ?? []),
      ])],
    },
  };
}

export function useStreamingInterpretation(packet: ContentPacket | null, debounceMs = 350) {
  const [queue, setQueue] = useState<ContentPacket[]>([]);
  const [response, setResponse] = useState<InterpretationResponse | null>(null);
  const [error, setError] = useState<RequestError | null>(null);
  const seen = useRef(new Set<string>());
  const source = useRef('');
  const generation = useRef(0);

  useEffect(() => {
    if (!packet) return;
    const packetMetadata = packet.metadata as Record<string, unknown>;
    if (packetMetadata.playbackState === 'seeking') {
      generation.current += 1;
      setQueue([]);
      return;
    }
    const nextSource = sourceIdentity(packet);
    if (source.current !== nextSource) {
      source.current = nextSource;
      seen.current.clear();
      setQueue([]);
      setResponse(null);
      generation.current += 1;
    }
    const timer = window.setTimeout(() => {
      const additions = segmentText(packet.text)
        .filter((text) => !seen.current.has(segmentIdentity(packet, text)))
        .map((text) => ({ ...packet, text }));
      additions.forEach((item) => seen.current.add(segmentIdentity(item)));
      if (additions.length > 0) setQueue((current) => [...current, ...additions]);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [packet ? JSON.stringify(packet) : '', debounceMs]);

  useEffect(() => {
    const next = queue[0];
    if (!next) return;
    const requestGeneration = generation.current;
    setError(null);
    void requestInterpretation(next)
      .then((result) => {
        if (requestGeneration === generation.current) {
          setResponse((current) => mergeInterpretations(current, result));
        }
      })
      .catch((requestError: RequestError) => {
        if (requestGeneration === generation.current) setError(requestError);
      })
      .finally(() => {
        if (requestGeneration === generation.current) setQueue((current) => current.slice(1));
      });
  }, [queue[0] ? `${sourceIdentity(queue[0])}:${queue[0].speaker ?? ''}:${queue[0].text}` : '']);

  const retry = useCallback(() => {
    setError(null);
    if (packet) {
      seen.current.delete(segmentIdentity(packet));
      setQueue((current) => [...current, packet]);
    }
  }, [packet ? JSON.stringify(packet) : '']);

  let state: InterpretationState = { status: 'idle' };
  if (response) state = { status: 'ready', response };
  else if (queue.length > 0) state = { status: 'loading' };
  else if (error) state = {
    status: 'error',
    code: error.code ?? 'connection-failure',
    message: error.message ?? 'Streaming interpretation could not continue.',
  };
  return { pending: queue.length, retry, state };
}
