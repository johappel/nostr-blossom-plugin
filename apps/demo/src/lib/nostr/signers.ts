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
  openAuthUrl: (url: string) => void;
  connectTimeoutMs: number;
  readyTimeoutMs: number;
}

const DEFAULT_NIP46_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];

const defaultNip46Deps: Nip46Deps = {
  createNdk: async (relays) => createNdkRuntime(relays),
  createNip46Signer: async (ndk, bunkerUrl) => createNip46SignerRuntime(ndk, bunkerUrl),
  computeEventId: async (event) => getEventHash(event as never),
  openAuthUrl: (url) => {
    if (typeof window !== 'undefined') {
      window.open(url, 'nip46-auth', 'width=520,height=720,noopener,noreferrer');
    }
  },
  connectTimeoutMs: 7000,
  readyTimeoutMs: 30000,
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    }),
  ]);
}

function parseRelayUrlsFromBunkerUrl(bunkerUrl: string) {
  const normalizeRelayUrl = (relay: string) => relay.trim().replace(/\/+$/, '');

  try {
    const url = new URL(bunkerUrl);
    const relays = url.searchParams.getAll('relay').map(normalizeRelayUrl).filter(Boolean);
    return relays.length > 0 ? relays : DEFAULT_NIP46_RELAYS;
  } catch {
    return DEFAULT_NIP46_RELAYS.map(normalizeRelayUrl);
  }
}

function createSignEventBridge(
  ndk: { connect: (timeoutMs?: number) => Promise<void> },
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

    let sig: string;

    try {
      sig = await nip46Signer.sign(unsignedEvent);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('relay not connected') || message.includes('waiting for connection')) {
        await ndk.connect(5000);
        sig = await nip46Signer.sign(unsignedEvent);
      } else {
        throw error;
      }
    }

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
    nip46ParsedRelays: [],
    nip46ActiveRelays: [],
  });

  if (!window.nostr) {
    authStore.set({
      method: null,
      pubkey: null,
      sessionStatus: 'error',
      sessionInfo: 'NIP-07 provider not found',
      nip46ParsedRelays: [],
      nip46ActiveRelays: [],
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
    nip46ParsedRelays: [],
    nip46ActiveRelays: [],
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
        nip46ParsedRelays: [],
        nip46ActiveRelays: [],
      });
    },
  };
}

export async function connectNip46Signer(bunkerUrl: string, deps: Nip46Deps = defaultNip46Deps): Promise<SignerAdapter> {
  const relays = parseRelayUrlsFromBunkerUrl(bunkerUrl);

  authStore.set({
    method: 'nip46',
    pubkey: null,
    sessionStatus: 'connecting',
    sessionInfo: 'Connecting to NIP-46 bunker',
    nip46ParsedRelays: relays,
    nip46ActiveRelays: [],
  });

  if (!bunkerUrl) {
    authStore.set({
      method: null,
      pubkey: null,
      sessionStatus: 'error',
      sessionInfo: 'NIP-46 bunker URL missing',
      nip46ParsedRelays: relays,
      nip46ActiveRelays: [],
    });
    throw new Error('NIP-46 bunker URL is required.');
  }
  const ndk = await deps.createNdk(relays);

  let nip46Signer:
    | {
        blockUntilReady: () => Promise<{ pubkey: string }>;
        stop: () => void;
        sign: (event: Record<string, unknown>) => Promise<string>;
        on?: (event: string, cb: (value: string) => void) => void;
      }
    | undefined;

  try {
    await ndk.connect(deps.connectTimeoutMs);

    nip46Signer = await deps.createNip46Signer(ndk, bunkerUrl);

    if (typeof nip46Signer.on === 'function') {
      nip46Signer.on('authUrl', (url: string) => {
        authStore.set({
          method: 'nip46',
          pubkey: null,
          sessionStatus: 'connecting',
          sessionInfo: 'NIP-46 requires authorization in popup window',
          nip46ParsedRelays: relays,
          nip46ActiveRelays: relays,
        });
        deps.openAuthUrl(url);
      });
    }

    const ndkUser = await withTimeout(
      nip46Signer.blockUntilReady(),
      deps.readyTimeoutMs,
      'NIP-46 session timed out while waiting for bunker authorization',
    );

    authStore.set({
      method: 'nip46',
      pubkey: ndkUser.pubkey,
      sessionStatus: 'connected',
      sessionInfo: `Connected to ${bunkerUrl} via ${relays.length} relay(s)`,
      nip46ParsedRelays: relays,
      nip46ActiveRelays: ((nip46Signer as { relayUrls?: string[] }).relayUrls ?? relays).map((relay) =>
        relay.replace(/\/+$/, ''),
      ),
    });

    return {
      kind: 'nip46',
      getPublicKey: async () => ndkUser.pubkey,
      signEvent: createSignEventBridge(ndk, ndkUser.pubkey, nip46Signer, deps),
      disconnect() {
        nip46Signer.stop();
        authStore.set({
          method: null,
          pubkey: null,
          sessionStatus: 'disconnected',
          sessionInfo: 'NIP-46 disconnected',
          nip46ParsedRelays: [],
          nip46ActiveRelays: [],
        });
      },
    };
  } catch (error) {
    nip46Signer?.stop?.();
    const errorMessage = error instanceof Error ? error.message : 'Unknown NIP-46 connection error';
    authStore.set({
      method: null,
      pubkey: null,
      sessionStatus: 'error',
      sessionInfo: errorMessage,
      nip46ParsedRelays: relays,
      nip46ActiveRelays: [],
    });
    throw error;
  }
}
