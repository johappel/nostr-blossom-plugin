/**
 * Fetch media shared with a community via kind:30222 targeted publications.
 *
 * Queries kind:30222 events that reference a community via `p` tags,
 * then resolves the linked NIP-94 (kind:1063) events.
 */

import { SimplePool } from 'nostr-tools/pool';
import type { CommunityMediaItem } from './types';

/**
 * Parse a kind:30222 event into a CommunityMediaItem.
 * Returns `null` if essential tags are missing.
 */
export function parseShareEvent(event: {
  id: string;
  pubkey: string;
  created_at: number;
  tags: string[][];
}): CommunityMediaItem | null {
  // Extract the referenced event ID (`e` tag)
  const eTag = event.tags.find(t => t[0] === 'e');
  if (!eTag?.[1]) return null;

  // Extract the original kind (`k` tag), default to 1063
  const kTag = event.tags.find(t => t[0] === 'k');
  const originalKind = kTag?.[1] ? parseInt(kTag[1], 10) : 1063;

  // Extract target community pubkeys from `p` tags
  const communities = event.tags
    .filter(t => t[0] === 'p' && t[1])
    .map(t => t[1]);

  if (communities.length === 0) return null;

  return {
    shareEventId: event.id,
    originalEventId: eTag[1],
    originalKind: isNaN(originalKind) ? 1063 : originalKind,
    sharedBy: event.pubkey,
    sharedAt: event.created_at,
    targetCommunities: communities,
  };
}

/**
 * Fetch media items shared with a community.
 *
 * 1. Queries kind:30222 events tagged with the community's pubkey.
 * 2. Extracts referenced event IDs.
 * 3. Resolves the original kind:1063 (NIP-94) events.
 *
 * @param communityPubkey - The community's hex pubkey
 * @param communityRelays - The community's relay URLs (from kind:10222 `r` tags)
 * @param fallbackRelays  - Additional relays for resolving original events
 * @returns Tuple of [share items, resolved NIP-94 event map (eventId → raw event)]
 */
export async function fetchCommunityMedia(
  communityPubkey: string,
  communityRelays: string[],
  fallbackRelays: string[] = [],
): Promise<{
  shares: CommunityMediaItem[];
  resolvedEvents: Map<string, { id: string; pubkey: string; created_at: number; tags: string[][]; content: string }>;
}> {
  const allRelays = [...new Set([...communityRelays, ...fallbackRelays])];
  if (!communityPubkey || allRelays.length === 0) {
    return { shares: [], resolvedEvents: new Map() };
  }

  const pool = new SimplePool();
  try {
    // 1. Fetch kind:30222 targeted at this community
    const shareEvents = await pool.querySync(allRelays, {
      kinds: [30222],
      '#p': [communityPubkey],
    });

    const shares: CommunityMediaItem[] = [];
    const eventIdsToResolve = new Set<string>();

    for (const ev of shareEvents) {
      const item = parseShareEvent(ev);
      if (item) {
        shares.push(item);
        eventIdsToResolve.add(item.originalEventId);
      }
    }

    // Sort newest first
    shares.sort((a, b) => b.sharedAt - a.sharedAt);

    if (eventIdsToResolve.size === 0) {
      return { shares, resolvedEvents: new Map() };
    }

    // 2. Resolve referenced NIP-94 events
    const resolvedEvents = new Map<string, {
      id: string;
      pubkey: string;
      created_at: number;
      tags: string[][];
      content: string;
    }>();

    const nip94Events = await pool.querySync(allRelays, {
      kinds: [1063],
      ids: [...eventIdsToResolve],
    });

    for (const ev of nip94Events) {
      resolvedEvents.set(ev.id, {
        id: ev.id,
        pubkey: ev.pubkey,
        created_at: ev.created_at,
        tags: ev.tags,
        content: ev.content,
      });
    }

    return { shares, resolvedEvents };
  } catch (err) {
    console.warn('[communikey] Failed to fetch community media:', err);
    return { shares: [], resolvedEvents: new Map() };
  } finally {
    pool.close(allRelays);
  }
}
