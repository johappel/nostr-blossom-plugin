/**
 * NIP-94 file metadata event helpers.
 *
 * Fetches kind 1063 events from Nostr relays, parses them into typed
 * `Nip94FileEvent` objects, and provides utilities for merging with local
 * upload history.
 *
 * Depends on `nostr-tools` (SimplePool) for relay queries.
 */

import { SimplePool } from 'nostr-tools/pool';
import type { BlossomSigner } from './types';
import type { ImageMetadataInput } from './metadata';
import type { UploadHistoryItem } from './history';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A parsed NIP-94 file metadata event (kind 1063).
 */
export interface Nip94FileEvent {
  /** Nostr event ID */
  eventId: string;
  /** Unix timestamp of event creation */
  createdAt: number;
  /** Event content (usually the file description) */
  content: string;
  /** Primary URL of the file */
  url: string;
  /** SHA-256 hash of the file */
  sha256: string;
  /** MIME type */
  mime: string;
  /** All raw tags from the event */
  tags: string[][];
  /** Parsed metadata */
  metadata: ImageMetadataInput;
  /** Thumbnail URL (from `thumb` tag), if present */
  thumbUrl?: string;
  /** Preview image URL (from `image` tag), if present */
  imageUrl?: string;
}

export interface Nip94FetchResult {
  events: Nip94FileEvent[];
  /** Fast lookup by file URL */
  byUrl: Map<string, Nip94FileEvent>;
  /** Fast lookup by SHA-256 (lowercase) */
  bySha256: Map<string, Nip94FileEvent>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getTag(tags: string[][], key: string): string {
  return tags.find((t) => t[0] === key)?.[1]?.trim() ?? '';
}

function getAllTags(tags: string[][], key: string): string[] {
  return tags.filter((t) => t[0] === key).map((t) => t[1]?.trim()).filter(Boolean) as string[];
}

function parseAiMode(tags: string[][]): 'generated' | 'assisted' | undefined {
  const hints = getAllTags(tags, 'hint');
  if (hints.includes('ai-image-generated')) return 'generated';
  if (hints.includes('ai-image-assisted')) return 'assisted';
  return undefined;
}

function parseLicenseFromTags(tags: string[][]): { license: string; licenseLabel?: string } {
  const licenseTag = tags.find((t) => t[0] === 'license');
  if (!licenseTag) return { license: '' };
  return {
    license: licenseTag[1]?.trim() ?? '',
    licenseLabel: licenseTag[2]?.trim() || undefined,
  };
}

function parseNip94Event(event: {
  id: string;
  created_at: number;
  content: string;
  tags: string[][];
}): Nip94FileEvent | null {
  const { tags } = event;
  const url = getTag(tags, 'url');
  if (!url) return null;

  const { license, licenseLabel } = parseLicenseFromTags(tags);

  return {
    eventId: event.id,
    createdAt: event.created_at,
    content: event.content,
    url,
    sha256: getTag(tags, 'x'),
    mime: getTag(tags, 'm'),
    tags,
    thumbUrl: getTag(tags, 'thumb') || undefined,
    imageUrl: getTag(tags, 'image') || undefined,
    metadata: {
      description: getTag(tags, 'summary') || event.content || '',
      altAttribution: getTag(tags, 'alt') || '',
      author: getTag(tags, 'author') || '',
      genre: getTag(tags, 'genre') || '',
      license,
      licenseLabel,
      keywords: getAllTags(tags, 't'),
      aiImageMode: parseAiMode(tags),
      aiMetadataGenerated: getAllTags(tags, 'hint').includes('ai-metadata-generated'),
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch NIP-94 kind 1063 file metadata events authored by the current user
 * from one or more relays.
 *
 * Returns parsed events with fast lookup maps for URL and SHA-256 matching.
 * The newest event per URL / hash wins in the lookup maps.
 *
 * @param signer    - BlossomSigner (used to get the author pubkey)
 * @param relayUrls - List of relay WebSocket URLs to query
 */
export async function fetchNip94Events(
  signer: BlossomSigner,
  relayUrls: string[],
): Promise<Nip94FetchResult> {
  if (relayUrls.length === 0) {
    return { events: [], byUrl: new Map(), bySha256: new Map() };
  }

  const pubkey = await signer.getPublicKey();
  const pool = new SimplePool();

  try {
    const rawEvents = await pool.querySync(relayUrls, {
      kinds: [1063],
      authors: [pubkey],
      limit: 500,
    });

    const events: Nip94FileEvent[] = [];
    const byUrl = new Map<string, Nip94FileEvent>();
    const bySha256 = new Map<string, Nip94FileEvent>();

    // Sort newest first so the latest event wins in the lookup maps
    rawEvents.sort((a, b) => b.created_at - a.created_at);

    for (const raw of rawEvents) {
      const parsed = parseNip94Event(raw);
      if (!parsed) continue;

      events.push(parsed);

      if (parsed.url && !byUrl.has(parsed.url)) {
        byUrl.set(parsed.url, parsed);
      }

      const sha256Key = parsed.sha256?.toLowerCase();
      if (sha256Key && !bySha256.has(sha256Key)) {
        bySha256.set(sha256Key, parsed);
      }
    }

    return { events, byUrl, bySha256 };
  } finally {
    pool.close(relayUrls);
  }
}

/**
 * Enrich a local `UploadHistoryItem` with data from NIP-94 relay events.
 *
 * Matches by URL first, then by SHA-256. Existing local metadata is never
 * overwritten; only fields that are missing locally are filled in.
 *
 * @param item  - Local upload history entry to enrich
 * @param nip94 - Fetch result from `fetchNip94Events`
 */
export function enrichWithNip94(
  item: UploadHistoryItem,
  nip94: Nip94FetchResult,
): UploadHistoryItem {
  const event =
    nip94.byUrl.get(item.url) ??
    (item.sha256 ? nip94.bySha256.get(item.sha256.toLowerCase()) : undefined);

  if (!event) return item;

  const hasLocalMetadata = Boolean(item.metadata?.description);
  const existingTags = item.uploadTags ?? [];
  const needsThumb = !existingTags.some((t) => t[0] === 'thumb') && event.thumbUrl;
  const needsImage = !existingTags.some((t) => t[0] === 'image') && event.imageUrl;

  const mergedTags = [
    ...existingTags,
    ...(needsThumb ? [['thumb', event.thumbUrl!]] : []),
    ...(needsImage ? [['image', event.imageUrl!]] : []),
  ];

  return {
    ...item,
    mime: item.mime || event.mime || undefined,
    sha256: item.sha256 || event.sha256 || undefined,
    uploadTags: mergedTags.length > 0 ? mergedTags : item.uploadTags,
    metadata: hasLocalMetadata ? item.metadata : event.metadata,
    publishedEventIds: item.publishedEventIds?.length
      ? item.publishedEventIds
      : [event.eventId],
    publishedKinds: item.publishedKinds?.length ? item.publishedKinds : [1063],
  };
}

/**
 * Collect all unique keywords from a `Nip94FetchResult` for building keyword
 * filter suggestion lists.
 *
 * @param nip94 - Fetch result from `fetchNip94Events`
 * @returns Sorted array of unique lowercase keywords
 */
export function collectNip94Keywords(nip94: Nip94FetchResult): string[] {
  const keywords = new Set<string>();
  for (const event of nip94.events) {
    for (const kw of event.metadata.keywords) {
      keywords.add(kw.toLowerCase());
    }
  }
  return [...keywords].sort();
}
