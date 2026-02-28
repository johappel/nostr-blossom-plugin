/**
 * Blossom blob deletion helpers (BUD-02) and NIP-09 deletion events.
 *
 * - `deleteBlossomBlob`: Deletes a blob from all configured servers via
 *   BUD-02 authenticated DELETE.
 * - `publishDeletionEvent`: Publishes a NIP-09 kind 5 deletion event to a
 *   relay to signal removal of previously published file metadata events.
 *
 * Depends on `nostr-tools` for relay communication.
 */

import { Relay } from 'nostr-tools/relay';
import type { BlossomSigner } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlossomDeleteServerResult {
  server: string;
  ok: boolean;
  /** HTTP status code, or 0 for network errors */
  status: number;
  message: string;
}

export interface BlossomDeleteResult {
  sha256: string;
  results: BlossomDeleteServerResult[];
}

export interface PublishDeletionResult {
  relayUrl: string;
  relays: Array<{ relayUrl: string; ok: boolean; error?: string }>;
  event: Record<string, unknown>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build and sign a BUD-02 auth event (kind 24242) for the `delete` action.
 */
async function createBlossomDeleteAuth(
  signer: BlossomSigner,
  sha256: string,
  reason: string,
): Promise<Record<string, unknown>> {
  const expiration = Math.floor(Date.now() / 1000) + 300; // 5 min

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

  return signer.signEvent(unsignedEvent) as Promise<Record<string, unknown>>;
}

async function deleteFromServer(
  serverUrl: string,
  sha256: string,
  authEvent: Record<string, unknown>,
): Promise<BlossomDeleteServerResult> {
  const normalized = serverUrl.replace(/\/$/, '');
  const url = `${normalized}/${sha256}`;
  const authHeader = `Nostr ${btoa(JSON.stringify(authEvent))}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });

    const message = response.ok
      ? 'Deleted'
      : `HTTP ${response.status}: ${await response.text().catch(() => 'No body')}`;

    return { server: normalized, ok: response.ok, status: response.status, message };
  } catch (error) {
    return {
      server: normalized,
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Delete a blob from all configured Blossom servers (BUD-02).
 *
 * Signs a per-hash auth event and issues an authenticated DELETE request to
 * every server concurrently. Partial failures are returned in `results` rather
 * than thrown so that callsites can proceed with partial success.
 *
 * @param signer  - BlossomSigner for building the auth event
 * @param servers - List of Blossom server base URLs
 * @param sha256  - SHA-256 hash of the blob to delete
 * @param reason  - Human-readable reason string for the auth event
 */
export async function deleteBlossomBlob(
  signer: BlossomSigner,
  servers: string[],
  sha256: string,
  reason = 'Delete blob',
): Promise<BlossomDeleteResult> {
  const authEvent = await createBlossomDeleteAuth(signer, sha256, reason);

  const settled = await Promise.allSettled(
    servers.map((server) => deleteFromServer(server, sha256, authEvent)),
  );

  return {
    sha256,
    results: settled.map((r) =>
      r.status === 'fulfilled'
        ? r.value
        : { server: 'unknown', ok: false, status: 0, message: String((r as PromiseRejectedResult).reason) },
    ),
  };
}

/**
 * Publish a NIP-09 kind 5 deletion event to request relay-side removal of
 * previously published events (e.g. kind 1063 file metadata events).
 *
 * Relay publish errors are caught and logged; the signed event is returned
 * regardless so callers can store it for retries.
 *
 * @param signer    - BlossomSigner
 * @param relayUrls - One or more WebSocket relay URLs
 * @param eventIds  - IDs of the events to delete
 * @param reason    - Reason string for the NIP-09 event content
 */
export async function publishDeletionEvent(
  signer: BlossomSigner,
  relayUrls: string | string[],
  eventIds: string[],
  reason = 'Deleted from gallery',
): Promise<PublishDeletionResult | null> {
  const urls = Array.isArray(relayUrls) ? relayUrls : [relayUrls];
  if (urls.length === 0) throw new Error('At least one relay URL is required for deletion.');
  if (eventIds.length === 0) return null;

  const tags = [
    ...eventIds.map((id) => ['e', id]),
    ['k', '1063'],
  ];

  const unsignedEvent: Record<string, unknown> = JSON.parse(
    JSON.stringify({
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: reason,
    }),
  );

  const signedEvent = await signer.signEvent(unsignedEvent);

  const relayResults = await Promise.all(
    urls.map(async (url) => {
      let relay: InstanceType<typeof Relay> | null = null;
      try {
        relay = await Relay.connect(url);
        await relay.publish(signedEvent as never);
        console.log(
          `[delete] kind 5 deletion event published to ${url}`,
          (signedEvent as Record<string, unknown>).id,
        );
        return { relayUrl: url, ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[delete] Failed to send kind 5 to ${url}:`, msg);
        return { relayUrl: url, ok: false, error: msg };
      } finally {
        relay?.close();
      }
    }),
  );

  return { relayUrl: urls[0], relays: relayResults, event: signedEvent as Record<string, unknown> };
}
