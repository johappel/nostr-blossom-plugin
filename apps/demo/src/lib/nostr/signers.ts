import { authStore } from '../stores/auth';
import { getEventHash } from 'nostr-tools';
import { createNdkRuntime, createNip46SignerRuntime } from './ndk-runtime.js';

export type SignerKind = 'nip07' | 'nip46';

export interface SignerAdapter {
  kind: SignerKind;
  getPublicKey: () => Promise<string>;
  signEvent: (event: Record<string, unknown>) => Promise<Record<string, unknown>>;
  disconnect?: () => Promise<void> | void;
}

interface Nip46Deps {
  createNdk: (relays: string[]) => Promise<{ connect: (timeoutMs?: number) => Promise<void> }>;
  createNip46Signer: (
    ndk: { connect: (timeoutMs?: number) => Promise<void> },
    bunkerUrl: string,
  ) => Promise<{
    blockUntilReady: () => Promise<{ pubkey: string }>;
    stop: () => void;
    sign: (event: Record<string, unknown>) => Promise<string>;
  }>;
  computeEventId: (event: Record<string, unknown>) => Promise<string>;
}

const DEFAULT_NIP46_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];

const defaultNip46Deps: Nip46Deps = {
  createNdk: async (relays) => createNdkRuntime(relays),
  createNip46Signer: async (ndk, bunkerUrl) => createNip46SignerRuntime(ndk, bunkerUrl),
  computeEventId: async (event) => getEventHash(event as never),
};

function parseRelayUrlsFromBunkerUrl(bunkerUrl: string) {
  try {
    const url = new URL(bunkerUrl);
    const relays = url.searchParams.getAll('relay').filter(Boolean);
    return relays.length > 0 ? relays : DEFAULT_NIP46_RELAYS;
  } catch {
    return DEFAULT_NIP46_RELAYS;
  }
}

function createSignEventBridge(
  userPubkey: string,
  nip46Signer: { sign: (event: Record<string, unknown>) => Promise<string> },
  deps: Nip46Deps,
) {
  return async (event: Record<string, unknown>) => {
    const unsignedEvent = {
      kind: (event.kind as number | undefined) ?? 24242,
      content: (event.content as string | undefined) ?? '',
      created_at: (event.created_at as number | undefined) ?? Math.floor(Date.now() / 1000),
      tags: (event.tags as string[][] | undefined) ?? [],
      pubkey: userPubkey,
    };

    const sig = await nip46Signer.sign(unsignedEvent);
    const id = await deps.computeEventId(unsignedEvent);
    return {
      ...unsignedEvent,
      id,
      sig,
    };
  };
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

export async function connectNip46Signer(bunkerUrl: string, deps: Nip46Deps = defaultNip46Deps): Promise<SignerAdapter> {
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

  const relays = parseRelayUrlsFromBunkerUrl(bunkerUrl);
  const ndk = await deps.createNdk(relays);

  await ndk.connect(4000);

  const nip46Signer = await deps.createNip46Signer(ndk, bunkerUrl);
  const ndkUser = await nip46Signer.blockUntilReady();

  authStore.set({
    method: 'nip46',
    pubkey: ndkUser.pubkey,
    sessionStatus: 'connected',
    sessionInfo: `Connected to ${bunkerUrl} via ${relays.length} relay(s)`,
  });

  return {
    kind: 'nip46',
    getPublicKey: async () => ndkUser.pubkey,
    signEvent: createSignEventBridge(ndkUser.pubkey, nip46Signer, deps),
    disconnect() {
      nip46Signer.stop();
      authStore.set({
        method: null,
        pubkey: null,
        sessionStatus: 'disconnected',
        sessionInfo: 'NIP-46 disconnected',
      });
    },
  };
}
