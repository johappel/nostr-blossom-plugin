import { describe, expect, it } from 'vitest';
import { connectNip46Signer } from './signers';

describe('signers', () => {
  it('connects nip46 signer with bunker url', async () => {
    const signer = await connectNip46Signer('bunker://my-signer');

    await expect(signer.getPublicKey?.()).resolves.toBe('nip46:bunker://my-signer');
  });

  it('rejects empty bunker url', async () => {
    await expect(connectNip46Signer('')).rejects.toThrow('NIP-46 bunker URL is required.');
  });
});
