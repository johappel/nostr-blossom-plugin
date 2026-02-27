/**
 * User settings persistence (localStorage + NIP-78 relay sync).
 *
 * Settings entered by the user in the widget's settings panel are stored
 * locally in `localStorage` (keyed by `appId`) and optionally synced to a
 * Nostr relay as a NIP-78 (kind 30078) application-specific data event.
 *
 * The host-provided `BlossomMediaConfig` serves as the base; user settings
 * act as a non-destructive override layer on top.
 */

import { Relay } from 'nostr-tools/relay';
import { SimplePool } from 'nostr-tools/pool';
import type { BlossomSigner } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Persisted per-user settings.  Every field is optional — only non-empty
 * values override the host configuration.
 */
export interface BlossomUserSettings {
  /** NIP-46 bunker URI (`bunker://…`). When set, preferred over NIP-07. */
  bunkerUri?: string;
  /** User-defined Blossom upload servers. */
  servers?: string[];
  /** User-defined Nostr relay URLs for NIP-94 publishing / fetching. */
  relays?: string[];
  /** Base URL of the image-describer / vision API (without `/describe`). */
  visionEndpoint?: string;
  /** Unix-ms timestamp of last modification (for NIP-78 merge). */
  updatedAt?: number;
}

/** NIP-78 `d`-tag value used to identify our settings event. */
const NIP78_D_TAG = 'blossom-media-settings';

/** Kind 30078 = NIP-78 application-specific data (replaceable). */
const NIP78_KIND = 30078;

// ─── localStorage helpers ─────────────────────────────────────────────────────

function storageKey(appId: string): string {
  return `blossom-settings:${appId}`;
}

/**
 * Load user settings from `localStorage`.
 * Returns an empty object when nothing is stored or parsing fails.
 */
export function loadSettingsFromLocalStorage(appId = 'default'): BlossomUserSettings {
  try {
    const raw = localStorage.getItem(storageKey(appId));
    if (!raw) return {};
    return JSON.parse(raw) as BlossomUserSettings;
  } catch {
    return {};
  }
}

/**
 * Persist user settings to `localStorage`.
 */
export function saveSettingsToLocalStorage(
  settings: BlossomUserSettings,
  appId = 'default',
): void {
  try {
    localStorage.setItem(
      storageKey(appId),
      JSON.stringify({ ...settings, updatedAt: Date.now() }),
    );
  } catch (err) {
    console.warn('[settings] Failed to write localStorage:', err);
  }
}

// ─── NIP-78 relay helpers ─────────────────────────────────────────────────────

/**
 * Publish user settings as a NIP-78 kind 30078 replaceable event.
 *
 * The event uses `d` = `blossom-media-settings` so there is at most one
 * settings event per pubkey.  Content is the JSON-serialised settings object.
 *
 * @returns The signed event, or `null` if publishing failed entirely.
 */
export async function publishSettingsEvent(
  signer: BlossomSigner,
  relayUrl: string,
  settings: BlossomUserSettings,
): Promise<Record<string, unknown> | null> {
  if (!relayUrl) {
    console.warn('[settings] No relay URL — skipping NIP-78 publish.');
    return null;
  }

  const content = JSON.stringify(settings);
  const tags: string[][] = [['d', NIP78_D_TAG]];

  const unsignedEvent: Record<string, unknown> = JSON.parse(
    JSON.stringify({
      kind: NIP78_KIND,
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
    console.log('[settings] NIP-78 settings published to', relayUrl);
  } catch (err) {
    console.warn('[settings] Failed to publish NIP-78 settings:', err);
  } finally {
    relay?.close();
  }

  return signedEvent;
}

/**
 * Fetch the latest NIP-78 settings event for a given pubkey.
 *
 * Queries one or more relays and returns the parsed settings from the
 * most recent kind 30078 event with `d` = `blossom-media-settings`.
 */
export async function fetchSettingsEvent(
  pubkey: string,
  relayUrls: string | string[],
): Promise<{ settings: BlossomUserSettings; createdAt: number } | null> {
  const urls = Array.isArray(relayUrls) ? relayUrls : [relayUrls];
  if (urls.length === 0) return null;

  const pool = new SimplePool();
  try {
    const events = await pool.querySync(urls, {
      kinds: [NIP78_KIND],
      authors: [pubkey],
      '#d': [NIP78_D_TAG],
      limit: 1,
    });

    if (!events.length) return null;

    // Pick the most recent event
    const best = events.reduce((a, b) =>
      (a.created_at ?? 0) > (b.created_at ?? 0) ? a : b,
    );

    const settings = JSON.parse(best.content as string) as BlossomUserSettings;
    return { settings, createdAt: best.created_at as number };
  } catch (err) {
    console.warn('[settings] Failed to fetch NIP-78 settings:', err);
    return null;
  } finally {
    pool.close(urls);
  }
}

// ─── Merge logic ──────────────────────────────────────────────────────────────

/**
 * Result of merging host config with user settings.
 */
export interface MergedConfig {
  servers: string[];
  relayUrl?: string;
  visionEndpoint?: string;
}

/**
 * Merge host-supplied config values with user settings.
 *
 * Rules:
 * - Non-empty user arrays override config arrays entirely.
 * - Non-empty user strings override config strings.
 * - Empty arrays / blank strings are ignored (fall through to config).
 * - For relays: `settings.relays[0]` becomes the primary `relayUrl`.
 */
export function mergeWithSettings(
  configServers: string[],
  configRelayUrl: string | undefined,
  configVisionEndpoint: string | undefined,
  settings: BlossomUserSettings,
): MergedConfig {
  const servers =
    settings.servers && settings.servers.length > 0
      ? settings.servers
      : configServers;

  const relayUrl =
    settings.relays && settings.relays.length > 0
      ? settings.relays[0]
      : configRelayUrl;

  const visionEndpoint =
    settings.visionEndpoint && settings.visionEndpoint.trim()
      ? settings.visionEndpoint.trim()
      : configVisionEndpoint;

  return { servers, relayUrl, visionEndpoint };
}

/**
 * Merge local settings with remote NIP-78 settings.
 * The more recently updated source wins per-field.
 */
export function mergeLocalAndRemote(
  local: BlossomUserSettings,
  remote: BlossomUserSettings,
  remoteCreatedAt: number,
): BlossomUserSettings {
  const localTs = local.updatedAt ?? 0;
  const remoteTs = remoteCreatedAt * 1000; // convert unix-s → ms

  // Remote is newer: use remote as base, keep local-only fields
  if (remoteTs > localTs) {
    return {
      ...local,
      ...remote,
      updatedAt: remoteTs,
    };
  }

  // Local is newer or equal: keep local as-is
  return local;
}
