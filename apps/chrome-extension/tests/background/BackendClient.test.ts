import { describe, expect, it, vi } from 'vitest';
import { BackendClient, BackendClientError } from '../../background/BackendClient';
import type { ContentPacket } from '../../shared/contentPacket';

const PACKET: ContentPacket = {
  platform: 'youtube',
  title: 'Test video',
  timestamp: '01:05',
  text: 'Official caption',
  metadata: { videoId: 'abc' },
};

const RESULT = {
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

describe('BackendClient', () => {
  it('invokes fetch without binding the BackendClient as its receiver', async () => {
    const health = {
      status: 'ok',
      service: 'signverse-api',
      version: '0.1.0',
      environment: 'test',
    } as const;
    const request = function (this: unknown): Promise<Response> {
      expect(this).toBeUndefined();
      return Promise.resolve(new Response(JSON.stringify(health), { status: 200 }));
    } as typeof fetch;

    const client = new BackendClient(
      { baseUrl: 'https://api.signverse.test', timeoutMs: 1_000 },
      request,
    );

    await expect(client.health()).resolves.toEqual(health);
  });

  it('requests and validates backend health', async () => {
    const health = {
      status: 'ok',
      service: 'signverse-api',
      version: '0.1.0',
      environment: 'test',
    } as const;
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(health), { status: 200 }),
    );
    const client = new BackendClient(
      { baseUrl: 'https://api.signverse.test', timeoutMs: 1_000 },
      request,
    );

    await expect(client.health()).resolves.toEqual(health);
    expect(request).toHaveBeenCalledWith(
      'https://api.signverse.test/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('posts ContentPackets to the configured interpret endpoint', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new BackendClient(
      { baseUrl: 'https://api.signverse.test', timeoutMs: 1_000 },
      request,
    );

    await expect(client.interpret(PACKET)).resolves.toEqual(RESULT);
    expect(request).toHaveBeenCalledWith(
      'https://api.signverse.test/interpret',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(PACKET) }),
    );
  });

  it.each([
    [503, 'backend-unavailable'],
    [422, 'invalid-response'],
  ] as const)('maps HTTP %s to %s', async (status, code) => {
    const client = new BackendClient(
      { baseUrl: 'https://api.signverse.test', timeoutMs: 1_000 },
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status })),
    );

    await expect(client.interpret(PACKET)).rejects.toMatchObject({ code });
  });

  it('rejects invalid response schemas', async () => {
    const client = new BackendClient(
      { baseUrl: 'https://api.signverse.test', timeoutMs: 1_000 },
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ summary: 'Incomplete' }), { status: 200 }),
      ),
    );

    await expect(client.interpret(PACKET)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('rejects invalid playback plans', async () => {
    const client = new BackendClient(
      { baseUrl: 'https://api.signverse.test', timeoutMs: 1_000 },
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({
          ...RESULT,
          playback: {
            items: [{ token_id: 'hello', asset_id: 'asset', duration: -1, confidence: 2 }],
            unsupported_tokens: [],
          },
        }), { status: 200 }),
      ),
    );

    await expect(client.interpret(PACKET)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('distinguishes timeouts, connection failures, and missing configuration', async () => {
    const timedOutRequest = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    );
    const timedOutClient = new BackendClient(
      { baseUrl: 'https://api.signverse.test', timeoutMs: 1 },
      timedOutRequest,
    );
    const disconnectedClient = new BackendClient(
      { baseUrl: 'https://api.signverse.test', timeoutMs: 1_000 },
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    const unconfiguredClient = new BackendClient({ baseUrl: '', timeoutMs: 1_000 });

    await expect(timedOutClient.interpret(PACKET)).rejects.toMatchObject({ code: 'timeout' });
    await expect(disconnectedClient.interpret(PACKET)).rejects.toMatchObject({
      code: 'connection-failure',
    });
    await expect(unconfiguredClient.interpret(PACKET)).rejects.toBeInstanceOf(BackendClientError);
    await expect(unconfiguredClient.interpret(PACKET)).rejects.toMatchObject({
      code: 'configuration',
    });
  });
});
