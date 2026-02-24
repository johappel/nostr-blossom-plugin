import { describe, expect, it } from 'vitest';
import { createBlossomUploadClient } from './upload-client';

describe('createBlossomUploadClient', () => {
  it('returns upload url from tags', async () => {
    const client = createBlossomUploadClient({
      servers: ['https://example.com'],
      signer: {},
      uploaderFactory: () => ({
        upload: async () => [
          ['url', 'https://example.com/file.png'],
          ['m', 'image/png'],
        ],
      }),
    });

    const result = await client.upload(new File(['a'], 'a.png', { type: 'image/png' }));

    expect(result.url).toBe('https://example.com/file.png');
    expect(result.tags).toHaveLength(2);
  });

  it('throws if url tag is missing', async () => {
    const client = createBlossomUploadClient({
      servers: ['https://example.com'],
      signer: {},
      uploaderFactory: () => ({
        upload: async () => [['m', 'image/png']],
      }),
    });

    await expect(client.upload(new File(['a'], 'a.png', { type: 'image/png' }))).rejects.toThrow(
      'Missing required NIP-94 url tag from Blossom upload response',
    );
  });

  it('throws timeout error if upload exceeds timeoutMs', async () => {
    const client = createBlossomUploadClient({
      servers: ['https://example.com'],
      signer: {},
      timeoutMs: 10,
      uploaderFactory: () => ({
        upload: async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([['url', 'https://example.com/slow.png']]), 50);
          }),
      }),
    });

    await expect(client.upload(new File(['a'], 'a.png', { type: 'image/png' }))).rejects.toThrow(
      'Upload timed out after 10ms',
    );
  });

  it('throws abort error when signal is aborted', async () => {
    const client = createBlossomUploadClient({
      servers: ['https://example.com'],
      signer: {},
      uploaderFactory: () => ({
        upload: async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([['url', 'https://example.com/file.png']]), 50);
          }),
      }),
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      client.upload(new File(['a'], 'a.png', { type: 'image/png' }), { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Upload aborted',
    });
  });

  it('supports partial multi-server failure when at least one server succeeds', async () => {
    const client = createBlossomUploadClient({
      servers: ['https://blossom-a.example', 'https://blossom-b.example'],
      signer: {},
      uploaderFactory: (options) => ({
        upload: async () => {
          const attempts = await Promise.allSettled(
            options.servers.map(async (server) => {
              if (server.includes('blossom-a')) {
                throw new Error('server unavailable');
              }

              return ['url', `${server}/abc123.png`] as [string, string];
            }),
          );

          const success = attempts.find(
            (attempt): attempt is PromiseFulfilledResult<[string, string]> => attempt.status === 'fulfilled',
          );

          if (!success) {
            throw new Error('all servers failed');
          }

          return [success.value, ['m', 'image/png']];
        },
      }),
    });

    const result = await client.upload(new File(['a'], 'a.png', { type: 'image/png' }));

    expect(result.url).toBe('https://blossom-b.example/abc123.png');
    expect(result.tags).toContainEqual(['m', 'image/png']);
  });
});
