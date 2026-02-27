/**
 * Blossom blob listing helper (BUD-02 / BUD-04).
 *
 * Fetches the list of blobs owned by the current user from all configured
 * servers, deduplicates by SHA-256, and returns a merged sorted result.
 */

import type { BlossomSigner } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Blob descriptor as returned by a Blossom server's `/list/{pubkey}` endpoint.
 */
export interface BlossomBlobDescriptor {
  url: string;
  sha256: string;
  size: number;
  type?: string;
  /** Unix timestamp (seconds) */
  created: number;
}

export interface BlossomListServerResult {
  server: string;
  count: number;
  ok: boolean;
  error?: string;
}

export interface BlossomListResult {
  /** Deduplicated blobs sorted by created date (newest first). */
  blobs: BlossomBlobDescriptor[];
  serverResults: BlossomListServerResult[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function createBlossomListAuth(
  signer: BlossomSigner,
): Promise<Record<string, unknown>> {
  const expiration = Math.floor(Date.now() / 1000) + 300;

  return signer.signEvent({
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    content: 'List blobs',
    tags: [
      ['t', 'list'],
      ['expiration', String(expiration)],
    ],
  }) as Promise<Record<string, unknown>>;
}

async function listFromServer(
  serverUrl: string,
  pubkey: string,
  authEvent: Record<string, unknown>,
): Promise<{ server: string; blobs: BlossomBlobDescriptor[]; ok: boolean; error?: string }> {
  const normalized = serverUrl.replace(/\/$/, '');
  const url = `${normalized}/list/${pubkey}`;
  const authHeader = `Nostr ${btoa(JSON.stringify(authEvent))}`;

  try {
    // Try authenticated request first
    let response = await fetch(url, { headers: { Authorization: authHeader } });

    // Fall back to unauthenticated if server denies (BUD-04 optional auth)
    if (response.status === 401 || response.status === 403) {
      response = await fetch(url);
    }

    if (!response.ok) {
      return { server: normalized, blobs: [], ok: false, error: `HTTP ${response.status}` };
    }

    const data: unknown = await response.json();
    const blobs: BlossomBlobDescriptor[] = Array.isArray(data) ? data : [];

    return { server: normalized, blobs, ok: true };
  } catch (error) {
    return {
      server: normalized,
      blobs: [],
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List all blobs for the current user from all configured Blossom servers.
 *
 * Results are merged and deduplicated by SHA-256. Partial server failures are
 * recorded in `serverResults` without throwing.
 *
 * @param signer  - BlossomSigner (used to fetch pubkey + sign list auth event)
 * @param servers - List of Blossom server base URLs
 */
export async function listBlossomBlobs(
  signer: BlossomSigner,
  servers: string[],
): Promise<BlossomListResult> {
  const pubkey = await signer.getPublicKey();
  const authEvent = await createBlossomListAuth(signer);

  const settled = await Promise.allSettled(
    servers.map((server) => listFromServer(server, pubkey, authEvent)),
  );

  const seenHashes = new Set<string>();
  const mergedBlobs: BlossomBlobDescriptor[] = [];
  const serverResults: BlossomListServerResult[] = [];

  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      serverResults.push({
        server: 'unknown',
        count: 0,
        ok: false,
        error: String((result as PromiseRejectedResult).reason),
      });
      continue;
    }

    const { server, blobs, ok, error } = result.value;
    serverResults.push({ server, count: blobs.length, ok, error });

    for (const blob of blobs) {
      if (!blob.sha256 || seenHashes.has(blob.sha256)) continue;
      seenHashes.add(blob.sha256);
      mergedBlobs.push(blob);
    }
  }

  // Sort newest first
  mergedBlobs.sort((a, b) => b.created - a.created);

  return { blobs: mergedBlobs, serverResults };
}
