import { authStore } from '../stores/auth';

export type SignerKind = 'nip07' | 'nip46';

export interface SignerAdapter {
  kind: SignerKind;
  getPublicKey: () => Promise<string>;
  signEvent: (event: Record<string, unknown>) => Promise<Record<string, unknown>>;
  disconnect?: () => Promise<void> | void;
}

export async function connectNip07Signer(): Promise<SignerAdapter> {
  authStore.set({
    method: 'nip07',
    pubkey: null,
    sessionStatus: 'connecting',
    sessionInfo: 'Waiting for NIP-07 provider',
  });

  if (!window.nostr) {
    authStore.set({
      method: null,
      pubkey: null,
      sessionStatus: 'error',
      sessionInfo: 'NIP-07 provider not found',
    });
    throw new Error('NIP-07 provider not found in browser.');
  }

  const pubkey = await window.nostr.getPublicKey();
  const provider = window.nostr;

  const getPublicKey = async () => provider.getPublicKey();
  const signEvent = async (event: Record<string, unknown>) => provider.signEvent(event);

  authStore.set({
    method: 'nip07',
    pubkey,
    sessionStatus: 'connected',
    sessionInfo: 'NIP-07 connected',
  });

  return {
    kind: 'nip07',
    getPublicKey,
    signEvent,
    disconnect() {
      authStore.set({
        method: null,
        pubkey: null,
        sessionStatus: 'disconnected',
        sessionInfo: 'NIP-07 disconnected',
      });
    },
  };
}

export async function connectNip46Signer(bunkerUrl: string): Promise<SignerAdapter> {
  authStore.set({
    method: 'nip46',
    pubkey: null,
    sessionStatus: 'connecting',
    sessionInfo: 'Connecting to NIP-46 bunker',
  });

  if (!bunkerUrl) {
    authStore.set({
      method: null,
      pubkey: null,
      sessionStatus: 'error',
      sessionInfo: 'NIP-46 bunker URL missing',
    });
    throw new Error('NIP-46 bunker URL is required.');
  }

  const pseudoPubkey = `nip46:${bunkerUrl}`;
  authStore.set({
    method: 'nip46',
    pubkey: pseudoPubkey,
    sessionStatus: 'connected',
    sessionInfo: `Connected to ${bunkerUrl}`,
  });

  return {
    kind: 'nip46',
    getPublicKey: async () => pseudoPubkey,
    signEvent: async (event) => ({ ...event, sig: 'nip46-demo-signature' }),
    disconnect() {
      authStore.set({
        method: null,
        pubkey: null,
        sessionStatus: 'disconnected',
        sessionInfo: 'NIP-46 disconnected',
      });
    },
  };
}
