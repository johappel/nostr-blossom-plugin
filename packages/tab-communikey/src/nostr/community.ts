/**
 * Fetch and resolve community information.
 *
 * kind:10222 provides the community's relay list, blossom servers, and
 * content sections.  The community's name and picture come from its
 * kind:0 profile (the community pubkey's metadata event).
 */

import { SimplePool } from 'nostr-tools/pool';
import { fetchProfile } from '@blossom/plugin/plugin';
import type { CommunityInfo, ContentSection } from './types';

/**
 * Parse a kind:10222 event into partial CommunityInfo (without name/picture).
 */
export function parseCommunityEvent(event: {
  pubkey: string;
  tags: string[][];
}): Omit<CommunityInfo, 'name' | 'picture'> {
  const relays: string[] = [];
  const blossomUrls: string[] = [];
  const sections: ContentSection[] = [];

  let currentSection: ContentSection | null = null;

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'r':
        if (tag[1]) relays.push(tag[1]);
        break;
      case 'blossom':
        if (tag[1]) blossomUrls.push(tag[1]);
        break;
      case 'content':
        // Each `content` tag starts a new section; subsequent `k` tags belong to it
        if (tag[1]) {
          currentSection = { name: tag[1], allowedKinds: [] };
          sections.push(currentSection);
        }
        break;
      case 'k':
        if (tag[1] && currentSection) {
          const kind = parseInt(tag[1], 10);
          if (!isNaN(kind)) currentSection.allowedKinds.push(kind);
        }
        break;
    }
  }

  return {
    pubkey: event.pubkey,
    relays,
    blossomUrls,
    contentSections: sections,
  };
}

/**
 * Fetch community info for a given community pubkey.
 *
 * 1. Queries kind:10222 from the community's relays (or user relays as fallback).
 * 2. Fetches the community's kind:0 profile for name/picture.
 *
 * @param communityPubkey - The community's hex pubkey
 * @param relayUrls       - Relay URLs to query (user relays + community relay hints)
 * @returns CommunityInfo or null if not found
 */
export async function fetchCommunity(
  communityPubkey: string,
  relayUrls: string[],
): Promise<CommunityInfo | null> {
  if (!communityPubkey || relayUrls.length === 0) return null;

  const pool = new SimplePool();
  try {
    // Fetch kind:10222 for this community pubkey
    const events = await pool.querySync(relayUrls, {
      kinds: [10222],
      authors: [communityPubkey],
      limit: 1,
    });

    if (!events.length) return null;

    // Use the most recent one
    const best = events.reduce((a, b) =>
      (a.created_at ?? 0) > (b.created_at ?? 0) ? a : b,
    );

    const partial = parseCommunityEvent(best);

    // Fetch profile (kind:0) for name/picture
    const allRelays = [...new Set([...relayUrls, ...partial.relays])];
    const profile = await fetchProfile(communityPubkey, allRelays);

    return {
      ...partial,
      name: profile?.displayName ?? profile?.name ?? undefined,
      picture: profile?.picture ?? undefined,
    };
  } catch (err) {
    console.warn('[communikey] Failed to fetch community:', err);
    return null;
  } finally {
    pool.close(relayUrls);
  }
}
