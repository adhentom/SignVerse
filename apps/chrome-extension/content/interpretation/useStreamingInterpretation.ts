import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentPacket } from '../../shared/contentPacket';
import type { InterpretationErrorCode, InterpretationResponse, InterpretationState } from '../../shared/interpretation';
import { StreamingPortClient } from './StreamingPortClient';
import { segmentText } from './sentenceSegmentation';
import { appendPlayback } from '../../playback/queue';
import { requestInterpretation } from './requestInterpretation';
import {
  attachPlaybackSynchronization,
  partitionTimedPacket,
} from '../../synchronization/SynchronizationTimeline';

interface RequestError { code?: InterpretationErrorCode; message?: string }

function sourceIdentity(packet: ContentPacket): string {
  const metadata = packet.metadata as Record<string, unknown>;
  const diagnosticMode = metadata.debug === true ? 'debug' : 'standard';
  return `${packet.platform}:${metadata.videoId ?? metadata.meetingId ?? metadata.pageUrl ?? packet.title}:${diagnosticMode}`;
}

export function segmentIdentity(packet: ContentPacket, text = packet.text): string {
  const metadata = packet.metadata as Record<string, unknown>;
  return `${sourceIdentity(packet)}:${metadata.language ?? ''}:${packet.speaker ?? ''}:${metadata.cueId ?? ''}:${text}`;
}

export function incrementalLiveText(previous: string, current: string): string {
  return current.startsWith(previous) ? current.slice(previous.length).trim() : current;
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
    isl_segments: next.isl_segments ?? current.isl_segments,
    quality: next.quality ?? current.quality,
    diagnostics: next.diagnostics ?? current.diagnostics,
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
  const websiteContext = useRef('');
  const lastLiveText = useRef(new Map<string, string>());
  const streamStatus = useRef<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const fallbackTimers = useRef(new Map<number, number>());
  const completed = useRef(new Set<number>());
  const requestPackets = useRef(new Map<number, ContentPacket>());
  const requestGeneration = useRef(0);
  const replaceNextResponse = useRef(false);
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
      if (message.type === 'status') {
        streamStatus.current = message.status;
        return;
      }
      if (message.type === 'interpretation') {
        if (completed.current.has(message.sequence)) return;
        completed.current.add(message.sequence);
        const sourcePacket = requestPackets.current.get(message.sequence);
        const synchronizedData = sourcePacket
          ? attachPlaybackSynchronization(message.data, sourcePacket, message.sequence)
          : message.data;
        requestPackets.current.delete(message.sequence);
        window.clearTimeout(fallbackTimers.current.get(message.sequence));
        fallbackTimers.current.delete(message.sequence);
        console.info('[SignVerse] interpretation_packet_received', {
          sequence: message.sequence,
          glossCount: synchronizedData.isl_gloss.length,
          playbackCount: synchronizedData.playback?.items.length ?? 0,
          unsupportedCount: synchronizedData.playback?.unsupported_tokens.length ?? 0,
        });
        setResponse((current) => {
          if (replaceNextResponse.current) {
            replaceNextResponse.current = false;
            console.info('[SignVerse] reading_context_playback_replaced', {
              playbackCount: synchronizedData.playback?.items.length ?? 0,
            });
            return synchronizedData;
          }
          return mergeInterpretations(current, synchronizedData);
        });
        setPending((current) => Math.max(0, current - 1));
        setError(null);
      } else if (message.type === 'error') {
        requestPackets.current.delete(message.sequence);
        setPending((current) => Math.max(0, current - 1));
        setError({ code: message.code as InterpretationErrorCode, message: message.message });
      }
    });
    return () => {
      fallbackTimers.current.forEach((timer) => window.clearTimeout(timer));
      fallbackTimers.current.clear();
      completed.current.clear();
      requestPackets.current.clear();
      lastLiveText.current.clear();
      websiteContext.current = '';
      requestGeneration.current += 1;
      replaceNextResponse.current = false;
      stream.close();
      if (client.current === stream) client.current = undefined;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !packet || !client.current) return;
    const metadata = packet.metadata as Record<string, unknown>;
    if (metadata.playbackState === 'seeking') {
      requestGeneration.current += 1;
      replaceNextResponse.current = false;
      client.current.reset();
      fallbackTimers.current.forEach((timer) => window.clearTimeout(timer));
      fallbackTimers.current.clear();
      completed.current.clear();
      requestPackets.current.clear();
      lastLiveText.current.clear();
      setPending(0);
      console.info('[SignVerse] media_seek_recovery_started', {
        preserveBufferedPlayback: response !== null,
      });
      return;
    }
    const nextSource = sourceIdentity(packet);
    if (source.current !== nextSource) {
      requestGeneration.current += 1;
      replaceNextResponse.current = false;
      source.current = nextSource;
      seen.current.clear();
      lastLiveText.current.clear();
      websiteContext.current = '';
      requestPackets.current.clear();
      client.current.reset();
      setPending(0);
      setResponse(null);
    }
    if (packet.platform === 'website') {
      const nextWebsiteContext = segmentIdentity(packet);
      if (websiteContext.current && websiteContext.current !== nextWebsiteContext) {
        requestGeneration.current += 1;
        seen.current.clear();
        fallbackTimers.current.forEach((timer) => window.clearTimeout(timer));
        fallbackTimers.current.clear();
        completed.current.clear();
        requestPackets.current.clear();
        replaceNextResponse.current = response !== null;
        console.info('[SignVerse] reading_context_changed', {
          preserveActivePlayback: replaceNextResponse.current,
        });
        client.current.reset();
        setPending(0);
      }
      websiteContext.current = nextWebsiteContext;
    } else {
      websiteContext.current = '';
    }
    const timer = window.setTimeout(() => {
      const liveKey = `${sourceIdentity(packet)}:${packet.speaker ?? ''}:${metadata.cueId ?? ''}`;
      const previousText = lastLiveText.current.get(liveKey) ?? '';
      const incrementalText = packet.platform !== 'website'
        ? incrementalLiveText(previousText, packet.text)
        : packet.text;
      if (packet.platform !== 'website') lastLiveText.current.set(liveKey, packet.text);
      const texts = segmentText(incrementalText)
        .filter((text) => !seen.current.has(segmentIdentity(packet, text)));
      const incrementalAppend = packet.platform !== 'website' &&
        previousText.length > 0 &&
        packet.text.startsWith(previousText);
      const timingPacket = incrementalAppend
        ? {
            ...packet,
            metadata: {
              ...packet.metadata,
              captionStartMs: (packet.metadata as Record<string, unknown>).playbackTimeMs ??
                (packet.metadata as Record<string, unknown>).captionStartMs,
            },
          }
        : packet;
      const additions = partitionTimedPacket(timingPacket, texts);
      additions.forEach((item) => seen.current.add(segmentIdentity(item)));
      additions.forEach((item) => {
        const generation = requestGeneration.current;
        const sequence = client.current?.send(item);
        if (sequence === undefined) return;
        requestPackets.current.set(sequence, item);
        console.info('[SignVerse] interpretation_packet_sent', {
          sequence,
          platform: item.platform,
          textLength: item.text.length,
          generation,
        });
        console.info('[SignVerse] packet_sent', {
          sequence,
          platform: item.platform,
          source: String(item.metadata.transcriptionSource ?? 'official'),
          textLength: item.text.length,
        });
        if (streamStatus.current === 'connected') return;
        const timer = window.setTimeout(() => {
          fallbackTimers.current.delete(sequence);
          if (completed.current.has(sequence) || streamStatus.current === 'connected') return;
          console.info('[SignVerse] stream_unavailable_rest_fallback', { sequence });
          void requestInterpretation(item)
            .then((data) => {
              if (generation !== requestGeneration.current || completed.current.has(sequence)) return;
              completed.current.add(sequence);
              requestPackets.current.delete(sequence);
              const synchronizedData = attachPlaybackSynchronization(data, item, sequence);
              setResponse((current) => {
                if (replaceNextResponse.current) {
                  replaceNextResponse.current = false;
                  return synchronizedData;
                }
                return mergeInterpretations(current, synchronizedData);
              });
              setPending((current) => Math.max(0, current - 1));
              setError(null);
            })
            .catch((fallbackError: RequestError) => {
              if (generation !== requestGeneration.current || completed.current.has(sequence)) return;
              completed.current.add(sequence);
              requestPackets.current.delete(sequence);
              setPending((current) => Math.max(0, current - 1));
              setError(fallbackError);
            });
        }, 750);
        fallbackTimers.current.set(sequence, timer);
      });
      if (additions.length > 0) setPending((current) => current + additions.length);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [enabled, packet ? JSON.stringify(packet) : '', debounceMs]);

  const retry = useCallback(() => {
    setError(null);
    if (packet && client.current) {
      const sequence = client.current.send(packet);
      requestPackets.current.set(sequence, packet);
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
