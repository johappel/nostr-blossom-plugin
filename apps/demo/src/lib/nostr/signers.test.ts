import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import { authStore } from '../stores/auth';
import { connectNip07Signer, connectNip46Signer } from './signers';

describe('signers', () => {
  beforeEach(() => {
    authStore.set({
      method: null,
      pubkey: null,
      sessionStatus: 'idle',
      sessionInfo: null,
    });
  });

  it('connects nip46 signer with bunker url', async () => {
    const signer = await connectNip46Signer('bunker://my-signer');

    expect(signer.kind).toBe('nip46');
    await expect(signer.getPublicKey()).resolves.toBe('nip46:bunker://my-signer');
    expect(get(authStore).sessionStatus).toBe('connected');
    expect(get(authStore).sessionInfo).toContain('bunker://my-signer');
  });

  it('keeps NIP-07 provider context for signEvent', async () => {
    const provider = {
      _call(event: Record<string, unknown>) {
        return Promise.resolve({ ...event, sig: 'sig', id: 'id' });
      },
      getPublicKey: async () => 'pubkey-07',
      signEvent(event: Record<string, unknown>) {
        return this._call(event);
      },
    };

    window.nostr = provider;

    const signer = await connectNip07Signer();
    await expect(signer.signEvent({ kind: 1, content: '', tags: [] })).resolves.toMatchObject({ sig: 'sig' });
    expect(get(authStore).sessionStatus).toBe('connected');
  });

  it('rejects empty bunker url', async () => {
    await expect(connectNip46Signer('')).rejects.toThrow('NIP-46 bunker URL is required.');
    expect(get(authStore).sessionStatus).toBe('error');
  });

  it('disconnects signer and updates session status', async () => {
    const signer = await connectNip46Signer('bunker://my-signer');

    signer.disconnect?.();

    const state = get(authStore);
    expect(state.method).toBe(null);
    expect(state.sessionStatus).toBe('disconnected');
  });
});
