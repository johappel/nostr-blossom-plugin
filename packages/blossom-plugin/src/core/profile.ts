/**
 * Minimal Nostr profile fetcher (kind 0 / NIP-01 metadata).
 *
 * Used by the settings panel to display the currently logged-in user's
 * name and avatar.  Intentionally lightweight — no caching, no full
 * profile parsing.
 */

import { SimplePool } from 'nostr-tools/pool';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NostrProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch a Nostr profile (kind 0) for the given pubkey.
 *
 * Queries one or more relays and returns the parsed content of the most
 * recent kind 0 event.  Returns `null` when no profile is found or all
 * relays fail.
 */
export async function fetchProfile(
  pubkey: string,
  relayUrls: string | string[],
): Promise<NostrProfile | null> {
  const urls = Array.isArray(relayUrls) ? relayUrls : [relayUrls];
  if (urls.length === 0 || !pubkey) return null;

  const pool = new SimplePool();
  try {
    const events = await pool.querySync(urls, {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });

    if (!events.length) return null;

    // Pick the most recent kind-0
    const best = events.reduce((a, b) =>
      (a.created_at ?? 0) > (b.created_at ?? 0) ? a : b,
    );

    const meta = JSON.parse(best.content as string) as Record<string, unknown>;

    return {
      pubkey,
      name: typeof meta.name === 'string' ? meta.name : undefined,
      displayName: typeof meta.display_name === 'string' ? meta.display_name : undefined,
      picture: typeof meta.picture === 'string' ? meta.picture : undefined,
      nip05: typeof meta.nip05 === 'string' ? meta.nip05 : undefined,
    };
  } catch (err) {
    console.warn('[profile] Failed to fetch profile:', err);
    return null;
  } finally {
    pool.close(urls);
  }
}

/**
 * Format a hex pubkey as a shortened `npub`-style display string.
 * Returns the first 8 and last 4 hex chars separated by "…".
 */
export function shortenPubkey(pubkey: string): string {
  if (!pubkey || pubkey.length < 16) return pubkey;
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;
}
