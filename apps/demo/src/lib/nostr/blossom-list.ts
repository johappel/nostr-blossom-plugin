import type { SignerAdapter } from './signers';

/**
 * Blob descriptor returned by Blossom servers (BUD-02 / BUD-04).
 * GET /list/{pubkey}
 */
export interface BlossomBlobDescriptor {
  url: string;
  sha256: string;
  size: number;
  type?: string;
  created: number;
}

/**
 * Build and sign a Blossom auth event (kind 24242) for listing.
 * Some servers require auth for list endpoints (BUD-04).
 */
async function createBlossomListAuth(signer: SignerAdapter) {
  const expiration = Math.floor(Date.now() / 1000) + 300;

  const unsignedEvent = {
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    content: 'List blobs',
    tags: [
      ['t', 'list'],
      ['expiration', String(expiration)],
    ],
  };

  const signedEvent = await signer.signEvent(unsignedEvent);
  return signedEvent;
}

/**
 * Fetch blob list from a single Blossom server.
 * Tries authenticated first, falls back to unauthenticated.
 */
async function listFromServer(
  serverUrl: string,
  pubkey: string,
  authEvent: Record<string, unknown>,
): Promise<{ server: string; blobs: BlossomBlobDescriptor[]; ok: boolean; error?: string }> {
  const normalizedServer = serverUrl.replace(/\/$/, '');
  const url = `${normalizedServer}/list/${pubkey}`;
  const authHeader = `Nostr ${btoa(JSON.stringify(authEvent))}`;

  try {
    // Try authenticated request first
    let response = await fetch(url, {
      headers: { Authorization: authHeader },
    });

    // If auth fails, try without auth (some servers allow public listing)
    if (response.status === 401 || response.status === 403) {
      response = await fetch(url);
    }

    if (!response.ok) {
      return {
        server: normalizedServer,
        blobs: [],
        ok: false,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const blobs: BlossomBlobDescriptor[] = Array.isArray(data) ? data : [];

    return { server: normalizedServer, blobs, ok: true };
  } catch (error) {
    return {
      server: normalizedServer,
      blobs: [],
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export interface BlossomListResult {
  blobs: BlossomBlobDescriptor[];
  serverResults: { server: string; count: number; ok: boolean; error?: string }[];
}

/**
 * List all blobs for the current user from all configured Blossom servers.
 * Merges results, deduplicates by sha256.
 */
export async function listBlossomBlobs(
  signer: SignerAdapter,
  servers: string[],
): Promise<BlossomListResult> {
  const pubkey = await signer.getPublicKey();
  const authEvent = await createBlossomListAuth(signer);

  const results = await Promise.allSettled(
    servers.map((server) =>
      listFromServer(server, pubkey, authEvent as Record<string, unknown>),
    ),
  );

  const seenHashes = new Set<string>();
  const mergedBlobs: BlossomBlobDescriptor[] = [];
  const serverResults: BlossomListResult['serverResults'] = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') {
      serverResults.push({
        server: 'unknown',
        count: 0,
        ok: false,
        error: String(result.reason),
      });
      continue;
    }

    const { server, blobs, ok, error } = result.value;
    serverResults.push({ server, count: blobs.length, ok, error });

    for (const blob of blobs) {
      if (!blob.sha256 || seenHashes.has(blob.sha256)) {
        continue;
      }
      seenHashes.add(blob.sha256);
      mergedBlobs.push(blob);
    }
  }

  // Sort by created date, newest first
  mergedBlobs.sort((a, b) => b.created - a.created);

  return { blobs: mergedBlobs, serverResults };
}
