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

export interface PublishEventResult {
  relayUrl: string;
  /** The fully signed Nostr event returned by the signer. */
  event: Record<string, unknown>;
}

/**
 * Sign and publish a Nostr event to a single relay.
 *
 * The event is signed via the provided `BlossomSigner`.  A deep-clone is
 * performed before handing the unsigned event to the signer because NIP-07
 * browser extensions use `structuredClone()` across the extension boundary,
 * which fails on Svelte 5 reactive proxies.
 *
 * Relay publish errors are caught and logged; the caller still receives the
 * signed event so it can be stored or retried independently.
 *
 * @param signer   - BlossomSigner (NIP-07, NIP-46, or any compatible adapter)
 * @param relayUrl - WebSocket URL of the target relay (required)
 * @param content  - Event content string
 * @param tags     - Event tags array
 * @param kind     - Nostr event kind (default: 1)
 */
export async function publishEvent(
  signer: BlossomSigner,
  relayUrl: string,
  content: string,
  tags: string[][],
  kind = 1,
): Promise<PublishEventResult> {
  if (!relayUrl) {
    throw new Error('Relay URL is required.');
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

  let relay: InstanceType<typeof Relay> | null = null;
  try {
    relay = await Relay.connect(relayUrl);
    await relay.publish(signedEvent as never);
    console.log(
      `[publish] kind ${kind} event published to ${relayUrl}`,
      (signedEvent as Record<string, unknown>).id,
    );
  } catch (err) {
    // Non-fatal: event is signed and can be retried by the caller.
    console.warn(`[publish] Failed to send kind ${kind} to ${relayUrl}:`, err);
  } finally {
    relay?.close();
  }

  return { relayUrl, event: signedEvent };
}
