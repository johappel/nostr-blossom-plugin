/**
 * NIP-46 Remote Signer (Bunker) adapter.
 *
 * Wraps NDK's `NDKNip46Signer` to produce a `BlossomSigner`-compatible object
 * that the rest of the plugin can use exactly like a NIP-07 signer.
 *
 * NDK is imported dynamically so the bundle cost is zero when NIP-46 is unused.
 */

import type { BlossomSigner } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BunkerStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface BunkerStatusCallback {
  (status: BunkerStatus, error?: string): void;
}

/** Opaque handle to a running NIP-46 session. */
export interface BunkerSession {
  /** BlossomSigner adapter — ready after `connect()` resolves. */
  signer: BlossomSigner;
  /** Hex-encoded local app private key — persist this to reconnect later. */
  localPrivateKeyHex: string;
  /** Disconnect from the bunker and release resources. */
  disconnect: () => void;
}

// ─── Connect ──────────────────────────────────────────────────────────────────

/**
 * Connect to a NIP-46 remote signer via a `bunker://` URI.
 *
 * ```ts
 * const session = await connectBunker(
 *   'bunker://pubkey?relay=wss://relay.nsecbunker.com&secret=abc',
 *   (status) => console.log('Bunker:', status),
 * );
 * const pubkey = await session.signer.getPublicKey();
 * ```
 *
 * @param bunkerUri  - Full `bunker://` connection string (NIP-46)
 * @param onStatus   - Optional callback for connection-state feedback
 * @param localPrivateKeyHex - Previously persisted local app key (hex) to
 *   reuse the same NIP-46 channel.  When omitted a fresh keypair is generated.
 * @returns A `BunkerSession` whose `.signer` property satisfies `BlossomSigner`
 */
export async function connectBunker(
  bunkerUri: string,
  onStatus?: BunkerStatusCallback,
  localPrivateKeyHex?: string,
): Promise<BunkerSession> {
  onStatus?.('connecting');

  try {
    // Dynamic import — NDK is only loaded when NIP-46 is actually used.
    const { default: NDK, NDKNip46Signer, NDKPrivateKeySigner } =
      await import('@nostr-dev-kit/ndk');

    // Local keypair used as the "app" side of the NIP-46 channel.
    // Re-use a previously persisted key so the bunker recognises the app.
    const localSigner = localPrivateKeyHex
      ? new NDKPrivateKeySigner(localPrivateKeyHex)
      : NDKPrivateKeySigner.generate();

    const ndk = new NDK({
      enableOutboxModel: false,
    });
    await ndk.connect();

    const nip46Signer = new NDKNip46Signer(ndk, bunkerUri, localSigner);

    // `blockUntilReady` waits for the ACK from the remote signer.
    await nip46Signer.blockUntilReady();

    // ── BlossomSigner adapter ──────────────────────────────────────────
    const signer: BlossomSigner = {
      getPublicKey: async () => {
        const user = await nip46Signer.user();
        return user.pubkey;
      },
      signEvent: async (event: Record<string, unknown>) => {
        // NDKNip46Signer.sign expects a partial NDKEvent-like object.
        // We construct a minimal one from the unsigned event dict.
        const { NDKEvent: NDKEventClass } = await import('@nostr-dev-kit/ndk');
        const ndkEvent = new NDKEventClass(ndk, event as never);
        await ndkEvent.sign(nip46Signer);

        // Return a plain object matching BlossomSigner's contract.
        return ndkEvent.rawEvent() as unknown as Record<string, unknown>;
      },
    };

    onStatus?.('connected');

    return {
      signer,
      localPrivateKeyHex: localSigner.privateKey,
      disconnect: () => {
        try {
          // NDKPool has no single close/destroy – disconnect each relay individually
          for (const relay of ndk.pool?.relays?.values() ?? []) {
            try { relay.disconnect(); } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onStatus?.('error', message);
    throw err;
  }
}

/**
 * Validate a bunker URI format.
 *
 * Basic sanity check — we accept anything starting with `bunker://` that
 * contains at least a relay query parameter.
 */
export function isValidBunkerUri(uri: string): boolean {
  if (!uri || !uri.startsWith('bunker://')) return false;
  try {
    const url = new URL(uri.replace('bunker://', 'https://'));
    return !!url.searchParams.get('relay');
  } catch {
    return false;
  }
}
