/**
 * Nostr event publishing helpers.
 *
 * Provides `publishEvent` for signing and sending arbitrary Nostr events,
 * re-exported here so consumers only need to import from `@blossom/plugin/core`.
 *
 * Depends on `nostr-tools` for relay communication.
 */

import { Relay } from 'nostr-tools/relay';
import type { BlossomSigner } from './types';

export interface PublishRelayResult {
  relayUrl: string;
  ok: boolean;
  error?: string;
}

export interface PublishEventResult {
  /** The first relay URL (for backward compat). */
  relayUrl: string;
  /** Per-relay success/failure details. */
  relays: PublishRelayResult[];
  /** The fully signed Nostr event returned by the signer. */
  event: Record<string, unknown>;
}

/**
 * Sign and publish a Nostr event to one or more relays.
 *
 * The event is signed once, then sent to every relay in parallel.
 * Individual relay failures are logged but do not reject the promise —
 * the caller receives per-relay status in `result.relays`.
 *
 * @param signer    - BlossomSigner (NIP-07, NIP-46, or any compatible adapter)
 * @param relayUrls - One or more WebSocket relay URLs
 * @param content   - Event content string
 * @param tags      - Event tags array
 * @param kind      - Nostr event kind (default: 1)
 */
export async function publishEvent(
  signer: BlossomSigner,
  relayUrls: string | string[],
  content: string,
  tags: string[][],
  kind = 1,
): Promise<PublishEventResult> {
  const urls = Array.isArray(relayUrls) ? relayUrls : [relayUrls];
  if (urls.length === 0) {
    throw new Error('At least one relay URL is required.');
  }

  // Deep-clone to strip Svelte 5 / framework reactivity proxies before
  // handing to NIP-07 / NIP-46 signers that use structuredClone internally.
  const unsignedEvent: Record<string, unknown> = JSON.parse(
    JSON.stringify({
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    }),
  );

  const signedEvent = await signer.signEvent(unsignedEvent);

  // Publish to all relays in parallel
  const relayResults = await Promise.all(
    urls.map(async (url): Promise<PublishRelayResult> => {
      let relay: InstanceType<typeof Relay> | null = null;
      try {
        relay = await Relay.connect(url);
        await relay.publish(signedEvent as never);
        console.log(
          `[publish] kind ${kind} event published to ${url}`,
          (signedEvent as Record<string, unknown>).id,
        );
        return { relayUrl: url, ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[publish] Failed to send kind ${kind} to ${url}:`, msg);
        return { relayUrl: url, ok: false, error: msg };
      } finally {
        relay?.close();
      }
    }),
  );

  return { relayUrl: urls[0], relays: relayResults, event: signedEvent };
}
