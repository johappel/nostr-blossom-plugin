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
});
