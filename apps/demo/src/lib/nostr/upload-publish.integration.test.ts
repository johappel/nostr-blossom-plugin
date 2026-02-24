import { createBlossomUploadClient } from '@blossom/plugin';
import { describe, expect, it, vi } from 'vitest';
import { publishEvent } from './publish';
import type { SignerAdapter } from './signers';

describe('upload + publish integration', () => {
  it('publishes event with uploaded file url tag', async () => {
    const signEventMock = vi.fn(async (event: Record<string, unknown>) => ({
      ...event,
      id: 'event-id',
      sig: 'event-sig',
    }));

    const signer: SignerAdapter = {
      kind: 'nip46',
      getPublicKey: async () => 'pubkey',
      signEvent: signEventMock,
    };

    const uploader = createBlossomUploadClient({
      servers: ['https://blossom.example/'],
      signer,
      uploaderFactory: () => ({
        upload: async () => [
          ['url', 'https://blossom.example/abc123.png'],
          ['m', 'image/png'],
          ['x', 'abc123'],
        ],
      }),
    });

    const uploaded = await uploader.upload(new File(['x'], 'image.png', { type: 'image/png' }));
    const published = await publishEvent(
      signer,
      'wss://relay.example',
      'Hello from blossom',
      uploaded.tags.map(([key, value]) => [key, value]),
    );

    expect(uploaded.url).toBe('https://blossom.example/abc123.png');
    expect(signEventMock).toHaveBeenCalledTimes(1);
    expect(published.relayUrl).toBe('wss://relay.example');

    const signedPayload = signEventMock.mock.calls[0][0] as {
      kind: number;
      content: string;
      tags: string[][];
    };

    expect(signedPayload.kind).toBe(1);
    expect(signedPayload.content).toBe('Hello from blossom');
    expect(signedPayload.tags[0]).toEqual(['url', 'https://blossom.example/abc123.png']);
  });
});
