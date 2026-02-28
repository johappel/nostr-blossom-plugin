/**
 * Publish a kind:30222 targeted publication event.
 *
 * This shares an existing NIP-94 (kind:1063) media event with a
 * Communikey community by creating an addressable, replaceable event.
 */

import { publishEvent } from '@blossom/plugin/plugin';
import type { BlossomSigner } from '@blossom/plugin/plugin';

/**
 * Generate a random hex string for the `d` tag.
 */
function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Publish a community share event (kind:30222).
 *
 * @param signer           - Nostr signer for signing the event
 * @param nip94EventId     - Event ID of the NIP-94 kind:1063 event being shared
 * @param communityPubkey  - Hex pubkey of the target community
 * @param communityRelay   - Primary relay URL of the target community
 * @param additionalRelays - Extra relays for redundancy
 * @returns The publish result, or throws on failure
 */
export async function publishCommunityShare(
  signer: BlossomSigner,
  nip94EventId: string,
  communityPubkey: string,
  communityRelay: string,
  additionalRelays: string[] = [],
) {
  const dTag = randomHex();
  const relayUrls = [communityRelay, ...additionalRelays].filter(Boolean);

  const tags: string[][] = [
    ['d', dTag],
    ['e', nip94EventId],
    ['k', '1063'],
    ['p', communityPubkey],
    ['r', communityRelay],
  ];

  return publishEvent(signer, relayUrls, '', tags, 30222);
}
