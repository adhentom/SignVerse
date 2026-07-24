import { getBackendConfig } from '../config/backendConfig';
import type {
  AudioCaptureMessage,
  AudioCaptureStatus,
} from '../shared/audioCapture';
import { isAudioCaptureMessage } from '../shared/audioCapture';

const SEGMENT_DURATION_MS = 4_500;
const MINIMUM_AUDIO_BYTES = 1_024;
const backendConfig = getBackendConfig();

let activeTabId: number | null = null;
let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let recorderTimer: number | null = null;
let audioContext: AudioContext | null = null;
let sequence = 0;
let captureGeneration = 0;
let uploadChain = Promise.resolve();

function sendStatus(status: AudioCaptureStatus, message: string): void {
  if (activeTabId === null) return;
  void chrome.runtime.sendMessage({
    type: 'SIGNVERSE_AUDIO_CAPTURE_STATUS',
    target: 'background',
    tabId: activeTabId,
    status,
    message,
  } satisfies AudioCaptureMessage);
}

function chooseMimeType(): string {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

async function transcribe(blob: Blob, tabId: number): Promise<void> {
  if (blob.size < MINIMUM_AUDIO_BYTES || !backendConfig.baseUrl) return;

  try {
    const response = await fetch(`${backendConfig.baseUrl}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'audio/webm',
        'X-SignVerse-Language': 'en',
      },
      body: blob,
      signal: AbortSignal.timeout(Math.max(15_000, backendConfig.timeoutMs)),
    });
    if (!response.ok) throw new Error(`Transcription failed with HTTP ${response.status}.`);
    const payload = await response.json() as { language?: unknown; text?: unknown };
    const text = typeof payload.text === 'string' ? payload.text.replace(/\s+/gu, ' ').trim() : '';
    if (!text || activeTabId !== tabId) return;

    sequence += 1;
    console.info('[SignVerse] transcription_received', {
      sequence,
      source: 'tab-audio',
      textLength: text.length,
    });
    await chrome.runtime.sendMessage({
      type: 'SIGNVERSE_AUDIO_TRANSCRIPT',
      target: 'background',
      tabId,
      sequence,
      text,
      language: typeof payload.language === 'string' ? payload.language : 'en',
    } satisfies AudioCaptureMessage);
  } catch (error) {
    console.error('[SignVerse] audio_transcription_failed', error);
    sendStatus('error', error instanceof Error ? error.message : 'Audio transcription failed.');
    await stopCapture(false);
  }
}

function startSegment(): void {
  if (!stream || activeTabId === null) return;
  const tabId = activeTabId;
  const generation = captureGeneration;
  const chunks: BlobPart[] = [];
  const mimeType = chooseMimeType();
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener('stop', () => {
    if (recorderTimer !== null) window.clearTimeout(recorderTimer);
    recorderTimer = null;
    const blob = new Blob(chunks, { type: recorder?.mimeType || mimeType || 'audio/webm' });
    if (generation !== captureGeneration) return;
    if (activeTabId === tabId && stream?.active) startSegment();
    uploadChain = uploadChain.then(() => transcribe(blob, tabId));
  }, { once: true });
  recorder.start();
  recorderTimer = window.setTimeout(() => {
    if (recorder?.state === 'recording') recorder.stop();
  }, SEGMENT_DURATION_MS);
}

async function stopCapture(notify = true): Promise<void> {
  const stoppedTabId = activeTabId;
  captureGeneration += 1;
  activeTabId = null;
  if (recorderTimer !== null) window.clearTimeout(recorderTimer);
  recorderTimer = null;
  if (recorder?.state === 'recording') recorder.stop();
  recorder = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  await audioContext?.close();
  audioContext = null;
  if (notify && stoppedTabId !== null) {
    void chrome.runtime.sendMessage({
      type: 'SIGNVERSE_AUDIO_CAPTURE_STATUS',
      target: 'background',
      tabId: stoppedTabId,
      status: 'stopped',
      message: 'Tab audio listening stopped.',
    } satisfies AudioCaptureMessage);
  }
}

async function startCapture(streamId: string, tabId: number): Promise<void> {
  await stopCapture(false);
  activeTabId = tabId;
  captureGeneration += 1;
  sequence = 0;
  sendStatus('starting', 'Connecting to tab audio…');

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      } as MediaTrackConstraints,
      video: false,
    });

    // Capturing a tab suppresses its local audio. Route it back to the output so
    // the user continues hearing the video while SignVerse listens.
    audioContext = new AudioContext();
    audioContext.createMediaStreamSource(stream).connect(audioContext.destination);
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener('ended', () => void stopCapture(), { once: true });
    });
    startSegment();
    sendStatus('listening', 'Listening to video audio for English speech.');
  } catch (error) {
    console.error('[SignVerse] audio_capture_failed', error);
    sendStatus('error', error instanceof Error ? error.message : 'Tab audio could not be captured.');
    await stopCapture(false);
  }
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isAudioCaptureMessage(message) || message.target !== 'offscreen') return false;
  if (message.type === 'SIGNVERSE_AUDIO_CAPTURE_START') {
    void startCapture(message.streamId, message.tabId);
  } else if (message.type === 'SIGNVERSE_AUDIO_CAPTURE_STOP') {
    void stopCapture();
  }
  return false;
});
