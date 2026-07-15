import { describe, expect, it, vi } from 'vitest';
import { BackendClient } from '../../background/BackendClient';
import { createInterpretationMessageHandler } from '../../background/interpretationMessageHandler';
import type { InterpretContentResponse } from '../../shared/backendMessages';
import { createInterpretContentRequest } from '../../shared/backendMessages';

describe('Extension to backend communication', () => {
  it('carries a packet through the service worker client and returns the typed response', async () => {
    const backendResponse = {
      summary: '',
      malayalam_translation: '',
      key_points: [],
      keywords: [],
      glossary: [],
      isl_gloss: [],
      confidence: 0,
      playback: {
        items: [],
        unsupported_tokens: [],
      },
    };
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(backendResponse), { status: 200 }),
    );
    const client = new BackendClient(
      { baseUrl: 'https://integration.signverse.test', timeoutMs: 1_000 },
      request,
    );
    const handler = createInterpretationMessageHandler(client);
    const message = createInterpretContentRequest({
      platform: 'google-meet',
      title: 'Accessibility Stand-up',
      speaker: 'Asha',
      timestamp: '10:20:30',
      text: 'Welcome to the meeting',
      metadata: { meetingId: 'abc-defg-hij', language: 'en-IN' },
    });

    const response = await new Promise<InterpretContentResponse>((resolve) => {
      const keepsChannelOpen = handler(message, {}, resolve);
      expect(keepsChannelOpen).toBe(true);
    });

    expect(request).toHaveBeenCalledWith(
      'https://integration.signverse.test/interpret',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(response).toEqual({
      ok: true,
      correlationId: message.correlationId,
      data: backendResponse,
    });
  });

  it('does not handle unrelated or malformed content-script messages', () => {
    const client = { interpret: vi.fn() };
    const handler = createInterpretationMessageHandler(client);

    expect(handler({ type: 'SIGNVERSE_CONTENT_READY' }, {}, vi.fn())).toBe(false);
    expect(handler({ type: 'SIGNVERSE_INTERPRET_CONTENT' }, {}, vi.fn())).toBe(false);
    expect(client.interpret).not.toHaveBeenCalled();
  });
});
