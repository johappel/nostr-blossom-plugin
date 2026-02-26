import type { SignerAdapter } from './signers';
import { Relay } from 'nostr-tools/relay';

/**
 * Build and sign a Blossom auth event (kind 24242) for deletion.
 * See BUD-02: Authorization is a signed Nostr event with:
 *   - kind: 24242
 *   - content: human-readable reason
 *   - tags: ["t", "delete"], ["x", sha256], ["expiration", unix]
 */
async function createBlossomDeleteAuth(
  signer: SignerAdapter,
  sha256: string,
  reason = 'Delete blob',
) {
  const expiration = Math.floor(Date.now() / 1000) + 300; // 5 minutes

  const unsignedEvent = {
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    content: reason,
    tags: [
      ['t', 'delete'],
      ['x', sha256],
      ['expiration', String(expiration)],
    ],
  };

  const signedEvent = await signer.signEvent(unsignedEvent);
  return signedEvent;
}

/**
 * Delete a blob from a single Blossom server.
 * Sends DELETE /{sha256} with Nostr authorization header.
 */
async function deleteFromServer(
  serverUrl: string,
  sha256: string,
  authEvent: Record<string, unknown>,
): Promise<{ server: string; ok: boolean; status: number; message: string }> {
  const normalizedServer = serverUrl.replace(/\/$/, '');
  const url = `${normalizedServer}/${sha256}`;

  const authHeader = `Nostr ${btoa(JSON.stringify(authEvent))}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: authHeader,
      },
    });

    const message = response.ok
      ? 'Deleted'
      : `HTTP ${response.status}: ${await response.text().catch(() => 'No body')}`;

    return { server: normalizedServer, ok: response.ok, status: response.status, message };
  } catch (error) {
    return {
      server: normalizedServer,
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export interface BlossomDeleteResult {
  sha256: string;
  results: { server: string; ok: boolean; status: number; message: string }[];
}

/**
 * Delete a blob from all configured Blossom servers.
 */
export async function deleteBlossomBlob(
  signer: SignerAdapter,
  servers: string[],
  sha256: string,
  reason = 'Delete blob',
): Promise<BlossomDeleteResult> {
  const authEvent = await createBlossomDeleteAuth(signer, sha256, reason);

  const results = await Promise.allSettled(
    servers.map((server) => deleteFromServer(server, sha256, authEvent as Record<string, unknown>)),
  );

  return {
    sha256,
    results: results.map((r) =>
      r.status === 'fulfilled'
        ? r.value
        : { server: 'unknown', ok: false, status: 0, message: String(r.reason) },
    ),
  };
}

/**
 * Publish a NIP-09 kind 5 deletion event to request relay deletion
 * of previously published events (e.g. kind 1063 file metadata).
 */
export async function publishDeletionEvent(
  signer: SignerAdapter,
  relayUrl: string,
  eventIds: string[],
  reason = 'Deleted from gallery',
) {
  if (!relayUrl) {
    throw new Error('Relay URL is required for deletion.');
  }

  if (eventIds.length === 0) {
    return null;
  }

  const tags = [
    ...eventIds.map((id) => ['e', id]),
    ['k', '1063'],  // NIP-09: specify kind being deleted
  ];

  const unsignedEvent = JSON.parse(JSON.stringify({
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: reason,
  }));

  const signedEvent = await signer.signEvent(unsignedEvent);

  // Actually publish to the relay
  let relay: InstanceType<typeof Relay> | null = null;
  try {
    relay = await Relay.connect(relayUrl);
    await relay.publish(signedEvent as never);
    console.log(`[delete] kind 5 deletion event published to ${relayUrl}`, (signedEvent as Record<string, unknown>).id);
  } catch (err) {
    console.warn(`[delete] Failed to send kind 5 to ${relayUrl}:`, err);
  } finally {
    relay?.close();
  }

  return { relayUrl, event: signedEvent };
}
