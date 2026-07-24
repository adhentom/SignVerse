import type { BackendConfig } from '../config/backendConfig';

export interface AudioTranscription {
  language: string;
  text: string;
}

/** Error returned when tab audio cannot be converted into a usable transcript. */
export class AudioTranscriptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AudioTranscriptionError';
  }
}

/**
 * Sends one recorded tab-audio segment to the configured transcription endpoint.
 *
 * The caller owns retry and capture lifecycle decisions. This function validates
 * the HTTP and JSON boundaries so malformed backend responses never reach the
 * content-packet pipeline.
 */
export async function transcribeAudio(
  blob: Blob,
  config: BackendConfig,
  language = 'en',
  request: typeof fetch = fetch,
): Promise<AudioTranscription> {
  if (!config.baseUrl) {
    throw new AudioTranscriptionError('The SignVerse transcription backend is not configured.');
  }

  let response: Response;
  try {
    response = await request(`${config.baseUrl}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'audio/webm',
        'X-SignVerse-Language': language,
      },
      body: blob,
      signal: AbortSignal.timeout(Math.max(15_000, config.timeoutMs)),
    });
  } catch (error) {
    throw new AudioTranscriptionError('The SignVerse transcription service could not be reached.', {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new AudioTranscriptionError(
      `Transcription failed with HTTP ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new AudioTranscriptionError(
      'The transcription service returned an invalid JSON response.',
      { cause: error },
    );
  }

  if (!payload || typeof payload !== 'object') {
    throw new AudioTranscriptionError('The transcription service returned an invalid response.');
  }

  const candidate = payload as { language?: unknown; text?: unknown };
  const text = typeof candidate.text === 'string'
    ? candidate.text.replace(/\s+/gu, ' ').trim()
    : '';
  if (!text) {
    throw new AudioTranscriptionError('The transcription service returned an empty transcript.');
  }

  return {
    language: typeof candidate.language === 'string' && candidate.language.trim()
      ? candidate.language
      : language,
    text,
  };
}
