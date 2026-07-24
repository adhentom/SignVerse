import type {
  AudioCaptureStatusMessage,
  AudioTranscriptMessage,
} from '../../shared/audioCapture';
import type { ContentPacket } from '../../shared/contentPacket';
import type { YouTubeLiveSnapshot, YouTubePacketMetadata } from '../../shared/youtube';

function audioMetadata(
  official: YouTubeLiveSnapshot | null,
  language: string,
  message?: AudioTranscriptMessage,
): YouTubePacketMetadata {
  const playbackTimeMs = official?.metadata.playbackTimeMs ?? 0;
  const durationMs = Math.max(0, message?.durationMs ?? 0);
  const captionStartMs = Math.max(0, playbackTimeMs - durationMs);
  const videoId = String(official?.metadata.videoId ?? '');
  return {
    captionEndMs: message ? playbackTimeMs : undefined,
    captionSource: message ? 'tab-audio' : undefined,
    captionStartMs: message ? captionStartMs : undefined,
    channel: String(official?.metadata.channel ?? 'Unknown channel'),
    cueId: message ? `${videoId}:tab-audio:${message.sequence}:${captionStartMs}` : undefined,
    language,
    videoId,
    captionsEnabled: false,
    isAdvertisement: Boolean(official?.metadata.isAdvertisement),
    isLive: Boolean(official?.metadata.isLive),
    playbackRate: official?.metadata.playbackRate ?? 1,
    playbackTimeMs,
    playbackState: official?.metadata.playbackState === 'paused' ? 'paused' : 'playing',
    transcriptionSource: 'tab-audio',
  };
}

export function audioStatusSnapshot(
  previous: YouTubeLiveSnapshot | null,
  official: YouTubeLiveSnapshot | null,
  message: AudioCaptureStatusMessage,
): YouTubeLiveSnapshot {
  return {
    status: message.status === 'error' ? 'interrupted' : 'loading',
    statusMessage: message.message,
    title: official?.title ?? 'YouTube',
    timestamp: official?.timestamp ?? '00:00',
    metadata: audioMetadata(official, 'en'),
    currentPacket: previous?.currentPacket ?? null,
    history: previous?.history ?? [],
  };
}

export function appendAudioTranscript(
  previous: YouTubeLiveSnapshot | null,
  official: YouTubeLiveSnapshot | null,
  message: AudioTranscriptMessage,
): YouTubeLiveSnapshot {
  const metadata = audioMetadata(official, message.language || 'en', message);
  const packet: ContentPacket<YouTubePacketMetadata> = {
    platform: 'youtube',
    title: official?.title ?? 'YouTube',
    timestamp: official?.timestamp ?? '00:00',
    text: message.text.replace(/\s+/gu, ' ').trim(),
    metadata,
  };
  const last = previous?.history.at(-1);
  const history = last?.text === packet.text
    ? previous?.history ?? []
    : [...(previous?.history ?? []), packet].slice(-10);
  return {
    status: metadata.playbackState === 'paused' ? 'paused' : 'playing',
    statusMessage: 'Transcribing English speech from tab audio.',
    title: packet.title,
    timestamp: packet.timestamp ?? '00:00',
    metadata,
    currentPacket: packet,
    history,
  };
}
