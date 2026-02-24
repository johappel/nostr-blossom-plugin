import { authStore } from '../stores/auth';

export interface NostrSignerLike {
  getPublicKey?: () => Promise<string>;
  signEvent?: (event: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export async function connectNip07Signer(): Promise<NostrSignerLike> {
  if (!window.nostr) {
    throw new Error('NIP-07 provider not found in browser.');
  }

  const pubkey = await window.nostr.getPublicKey();
  authStore.set({ method: 'nip07', pubkey });

  return window.nostr;
}

export async function connectNip46Signer(bunkerUrl: string): Promise<NostrSignerLike> {
  if (!bunkerUrl) {
    throw new Error('NIP-46 bunker URL is required.');
  }

  const pseudoPubkey = `nip46:${bunkerUrl}`;
  authStore.set({ method: 'nip46', pubkey: pseudoPubkey });

  return {
    getPublicKey: async () => pseudoPubkey,
    signEvent: async (event) => ({ ...event, sig: 'nip46-demo-signature' }),
  };
}
