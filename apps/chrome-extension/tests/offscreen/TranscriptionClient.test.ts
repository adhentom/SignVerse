import { describe, expect, it, vi } from 'vitest';
import {
  AudioTranscriptionError,
  transcribeAudio,
} from '../../offscreen/transcriptionClient';

const config = {
  baseUrl: 'http://127.0.0.1:8000',
  timeoutMs: 10_000,
};

describe('transcribeAudio', () => {
  it('uploads an audio segment and normalizes a valid transcript', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      language: 'en-IN',
      text: '  accessibility   for everyone  ',
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));
    const blob = new Blob(['recorded audio'], { type: 'audio/webm' });

    await expect(transcribeAudio(blob, config, 'en', request)).resolves.toEqual({
      language: 'en-IN',
      text: 'accessibility for everyone',
    });
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/transcribe',
      expect.objectContaining({
        body: blob,
        headers: {
          'Content-Type': 'audio/webm',
          'X-SignVerse-Language': 'en',
        },
        method: 'POST',
      }),
    );
  });

  it('reports invalid and empty responses without leaking parsing errors', async () => {
    const invalidJson = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', { status: 200 }),
    );
    const emptyTranscript = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ text: '   ' }), { status: 200 }),
    );

    await expect(transcribeAudio(new Blob(['audio']), config, 'en', invalidJson))
      .rejects.toThrow('invalid JSON response');
    await expect(transcribeAudio(new Blob(['audio']), config, 'en', emptyTranscript))
      .rejects.toThrow('empty transcript');
  });

  it('converts HTTP and network failures to the transcription error contract', async () => {
    const serverFailure = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 503 }),
    );
    const networkFailure = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));

    await expect(transcribeAudio(new Blob(['audio']), config, 'en', serverFailure))
      .rejects.toEqual(expect.objectContaining({
        message: 'Transcription failed with HTTP 503.',
        name: 'AudioTranscriptionError',
      }));
    await expect(transcribeAudio(new Blob(['audio']), config, 'en', networkFailure))
      .rejects.toBeInstanceOf(AudioTranscriptionError);
  });

  it('requires an explicitly configured backend', async () => {
    await expect(transcribeAudio(
      new Blob(['audio']),
      { baseUrl: '', timeoutMs: 10_000 },
    )).rejects.toThrow('not configured');
  });
});
