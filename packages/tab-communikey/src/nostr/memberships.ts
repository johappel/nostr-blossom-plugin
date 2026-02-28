/**
 * Fetch community memberships for a user.
 *
 * Queries kind:30382 events authored by the given pubkey.
 * Each event with a `d` tag pointing to a community pubkey and a
 * relationship tag of `"follow"` represents a membership.
 */

import { SimplePool } from 'nostr-tools/pool';
import type { CommunityMembership } from './types';

/**
 * Parse a single kind:30382 event into a CommunityMembership.
 * Returns `null` if the event doesn't represent a valid community follow.
 */
export function parseMembershipEvent(event: {
  tags: string[][];
}): CommunityMembership | null {
  const dTag = event.tags.find(t => t[0] === 'd');
  if (!dTag?.[1]) return null;

  // Check for relationship = "follow" (or "member")
  const relTag = event.tags.find(
    t => (t[0] === 'n' || t[0] === 'relationship') && t[1],
  );
  const relationship = relTag?.[1]?.toLowerCase();
  if (relationship !== 'follow' && relationship !== 'member') return null;

  // Optional relay hint from an `r` tag
  const rTag = event.tags.find(t => t[0] === 'r');

  return {
    communityPubkey: dTag[1],
    relayHint: rTag?.[1],
  };
}

/**
 * Fetch all community memberships for a user from relays.
 *
 * @param pubkey    - Hex pubkey of the user
 * @param relayUrls - Relay URLs to query
 * @returns Array of community memberships
 */
export async function fetchMemberships(
  pubkey: string,
  relayUrls: string[],
): Promise<CommunityMembership[]> {
  if (!pubkey || relayUrls.length === 0) return [];

  const pool = new SimplePool();
  try {
    const events = await pool.querySync(relayUrls, {
      kinds: [30382],
      authors: [pubkey],
    });

    const memberships: CommunityMembership[] = [];
    const seen = new Set<string>();

    for (const ev of events) {
      const m = parseMembershipEvent(ev);
      if (m && !seen.has(m.communityPubkey)) {
        seen.add(m.communityPubkey);
        memberships.push(m);
      }
    }

    return memberships;
  } catch (err) {
    console.warn('[communikey] Failed to fetch memberships:', err);
    return [];
  } finally {
    pool.close(relayUrls);
  }
}
