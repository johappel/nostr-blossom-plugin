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
      nip46ParsedRelays: [],
      nip46ActiveRelays: [],
    });
  });

  it('connects nip46 signer with bunker url', async () => {
    const signer = await connectNip46Signer('bunker://my-signer?relay=wss%3A%2F%2Frelay.example', {
      createNdk: async () =>
        ({
          connect: async () => undefined,
        }) as never,
      createNip46Signer: async () =>
        ({
          blockUntilReady: async () => ({ pubkey: 'pubkey-46' }),
          stop: () => undefined,
          sign: async () => 'sig-46',
        }) as never,
      computeEventId: async () => 'event-id',
      openAuthUrl: () => undefined,
      connectTimeoutMs: 10,
      readyTimeoutMs: 10,
    });

    expect(signer.kind).toBe('nip46');
    await expect(signer.getPublicKey()).resolves.toBe('pubkey-46');
    expect(get(authStore).sessionStatus).toBe('connected');
    expect(get(authStore).sessionInfo).toContain('relay(s)');
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
    const signer = await connectNip46Signer('bunker://my-signer', {
      createNdk: async () =>
        ({
          connect: async () => undefined,
        }) as never,
      createNip46Signer: async () =>
        ({
          blockUntilReady: async () => ({ pubkey: 'pubkey-46' }),
          stop: () => undefined,
          sign: async () => 'sig-46',
        }) as never,
      computeEventId: async () => 'event-id',
      openAuthUrl: () => undefined,
      connectTimeoutMs: 10,
      readyTimeoutMs: 10,
    });

    signer.disconnect?.();

    const state = get(authStore);
    expect(state.method).toBe(null);
    expect(state.sessionStatus).toBe('disconnected');
  });

  it('reconnects and retries signing when relay is not connected', async () => {
    let connectCalls = 0;
    let signCalls = 0;

    const signer = await connectNip46Signer('bunker://my-signer?relay=wss%3A%2F%2Frelay.example%2F', {
      createNdk: async () =>
        ({
          connect: async () => {
            connectCalls += 1;
          },
        }) as never,
      createNip46Signer: async () =>
        ({
          blockUntilReady: async () => ({ pubkey: 'pubkey-46' }),
          stop: () => undefined,
          sign: async () => {
            signCalls += 1;
            if (signCalls === 1) {
              throw new Error('Relay not connected, waiting for connection to publish an event');
            }
            return 'sig-46';
          },
        }) as never,
      computeEventId: async () => 'event-id',
      openAuthUrl: () => undefined,
      connectTimeoutMs: 10,
      readyTimeoutMs: 10,
    });

    const signed = await signer.signEvent({ kind: 24242, content: '', tags: [] });

    expect(connectCalls).toBe(2);
    expect(signCalls).toBe(2);
    expect(signed).toMatchObject({ id: 'event-id', sig: 'sig-46' });
  });

  it('sets session to error when NIP-46 handshake times out', async () => {
    await expect(
      connectNip46Signer('bunker://my-signer', {
        createNdk: async () =>
          ({
            connect: async () => undefined,
          }) as never,
        createNip46Signer: async () =>
          ({
            blockUntilReady: async () =>
              new Promise<{ pubkey: string }>(() => {
                /* never resolves */
              }),
            stop: () => undefined,
            sign: async () => 'sig-46',
          }) as never,
        computeEventId: async () => 'event-id',
        openAuthUrl: () => undefined,
        connectTimeoutMs: 10,
        readyTimeoutMs: 10,
      }),
    ).rejects.toThrow('NIP-46 session timed out while waiting for bunker authorization');

    expect(get(authStore).sessionStatus).toBe('error');
  });
});
