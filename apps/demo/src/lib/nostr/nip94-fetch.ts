import { SimplePool } from 'nostr-tools/pool';
import type { SignerAdapter } from './signers';
import type { ImageMetadataInput } from './publish';
import type { UploadHistoryItem } from '$lib/stores/uploads';

/**
 * A parsed NIP-94 file metadata event (kind 1063).
 */
export interface Nip94FileEvent {
  /** Nostr event ID */
  eventId: string;
  /** Unix timestamp of event creation */
  createdAt: number;
  /** Event content (usually the description) */
  content: string;
  /** URL of the file */
  url: string;
  /** SHA-256 hash */
  sha256: string;
  /** MIME type */
  mime: string;
  /** All raw tags from the event */
  tags: string[][];
  /** Parsed metadata */
  metadata: ImageMetadataInput;
  /** Thumbnail URL if present */
  thumbUrl?: string;
  /** Preview image URL if present */
  imageUrl?: string;
}

function getTag(tags: string[][], key: string): string {
  return tags.find((t) => t[0] === key)?.[1]?.trim() ?? '';
}

function getAllTags(tags: string[][], key: string): string[] {
  return tags.filter((t) => t[0] === key).map((t) => t[1]?.trim()).filter(Boolean);
}

function parseAiMode(tags: string[][]): 'generated' | 'assisted' | undefined {
  const hints = getAllTags(tags, 'hint');
  if (hints.includes('ai-image-generated')) return 'generated';
  if (hints.includes('ai-image-assisted')) return 'assisted';
  return undefined;
}

function parseAiMetadataGenerated(tags: string[][]): boolean {
  return getAllTags(tags, 'hint').includes('ai-metadata-generated');
}

function parseLicense(tags: string[][]): { license: string; licenseLabel?: string } {
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
  const tags = event.tags;
  const url = getTag(tags, 'url');
  const sha256 = getTag(tags, 'x');

  if (!url) return null;

  const { license, licenseLabel } = parseLicense(tags);

  return {
    eventId: event.id,
    createdAt: event.created_at,
    content: event.content,
    url,
    sha256,
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
      aiMetadataGenerated: parseAiMetadataGenerated(tags),
    },
  };
}

export interface Nip94FetchResult {
  events: Nip94FileEvent[];
  /** Lookup by URL for fast merge */
  byUrl: Map<string, Nip94FileEvent>;
  /** Lookup by SHA-256 for fast merge */
  bySha256: Map<string, Nip94FileEvent>;
}

/**
 * Fetch NIP-94 file metadata events (kind 1063) for the current user
 * from the given relays. Returns parsed events with metadata.
 */
export async function fetchNip94Events(
  signer: SignerAdapter,
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

    // Sort by created_at desc, so newest event wins in the maps
    rawEvents.sort((a, b) => b.created_at - a.created_at);

    for (const raw of rawEvents) {
      const parsed = parseNip94Event(raw);
      if (!parsed) continue;

      events.push(parsed);

      // Only keep the newest event per URL / hash
      if (parsed.url && !byUrl.has(parsed.url)) {
        byUrl.set(parsed.url, parsed);
      }
      // Normalize sha256 to lowercase for reliable matching
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
 * Enrich an UploadHistoryItem with NIP-94 metadata from relay events.
 * Matches by URL first, then by SHA-256 hash.
 */
export function enrichWithNip94(
  item: UploadHistoryItem,
  nip94: Nip94FetchResult,
): UploadHistoryItem {
  // Normalize sha256 to lowercase for reliable matching with the map
  const event = nip94.byUrl.get(item.url)
    ?? (item.sha256 ? nip94.bySha256.get(item.sha256.toLowerCase()) : undefined);

  if (!event) return item;

  // Don't overwrite local metadata if it already exists
  const hasLocalMetadata = item.metadata && item.metadata.description;

  const enrichedTags = item.uploadTags ?? [];
  const needsThumb = !enrichedTags.some((t) => t[0] === 'thumb') && event.thumbUrl;
  const needsImage = !enrichedTags.some((t) => t[0] === 'image') && event.imageUrl;

  const mergedTags = [
    ...enrichedTags,
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
    publishedKinds: item.publishedKinds?.length
      ? item.publishedKinds
      : [1063],
  };
}

/**
 * Collect all unique keywords from a Nip94FetchResult for filter suggestions.
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
