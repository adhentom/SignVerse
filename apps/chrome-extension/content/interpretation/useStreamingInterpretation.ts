import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentPacket } from '../../shared/contentPacket';
import type { InterpretationErrorCode, InterpretationResponse, InterpretationState } from '../../shared/interpretation';
import { StreamingPortClient } from './StreamingPortClient';
import { segmentText } from './sentenceSegmentation';
import { appendPlayback } from '../../playback/queue';

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
    playback: appendPlayback(
      current.playback ?? { items: [], unsupported_tokens: [] },
      next.playback ?? { items: [], unsupported_tokens: [] },
    ),
  };
}

export function useStreamingInterpretation(
  packet: ContentPacket | null,
  debounceMs = 350,
  enabled = true,
) {
  const client = useRef<StreamingPortClient | undefined>(undefined);
  const seen = useRef(new Set<string>());
  const source = useRef('');
  const [pending, setPending] = useState(0);
  const [response, setResponse] = useState<InterpretationResponse | null>(null);
  const [error, setError] = useState<RequestError | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stream: StreamingPortClient;
    try {
      stream = new StreamingPortClient();
    } catch (streamError) {
      setError({
        code: 'extension-context-invalidated',
        message: streamError instanceof Error ? streamError.message : 'The streaming connection could not start.',
      });
      return;
    }
    client.current = stream;
    stream.subscribe((message) => {
      if (message.type === 'interpretation') {
        setResponse((current) => mergeInterpretations(current, message.data));
        setPending((current) => Math.max(0, current - 1));
        setError(null);
      } else if (message.type === 'error') {
        setPending((current) => Math.max(0, current - 1));
        setError({ code: message.code as InterpretationErrorCode, message: message.message });
      }
    });
    return () => {
      stream.close();
      if (client.current === stream) client.current = undefined;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !packet || !client.current) return;
    const metadata = packet.metadata as Record<string, unknown>;
    if (metadata.playbackState === 'seeking') {
      client.current.reset();
      setPending(0);
      return;
    }
    const nextSource = sourceIdentity(packet);
    if (source.current !== nextSource) {
      source.current = nextSource;
      seen.current.clear();
      client.current.reset();
      setPending(0);
      setResponse(null);
    }
    const timer = window.setTimeout(() => {
      const additions = segmentText(packet.text)
        .filter((text) => !seen.current.has(segmentIdentity(packet, text)))
        .map((text) => ({ ...packet, text }));
      additions.forEach((item) => seen.current.add(segmentIdentity(item)));
      additions.forEach((item) => client.current?.send(item));
      if (additions.length > 0) setPending((current) => current + additions.length);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [enabled, packet ? JSON.stringify(packet) : '', debounceMs]);

  const retry = useCallback(() => {
    setError(null);
    if (packet && client.current) {
      client.current.send(packet);
      setPending((current) => current + 1);
    }
  }, [packet ? JSON.stringify(packet) : '']);

  let state: InterpretationState = { status: 'idle' };
  if (response) state = { status: 'ready', response };
  else if (pending > 0) state = { status: 'loading' };
  else if (error) state = {
    status: 'error',
    code: error.code ?? 'connection-failure',
    message: error.message ?? 'Streaming interpretation could not continue.',
  };
  return { pending, retry, state };
}
