/**
 * Shared helper for publishing media metadata (NIP-94 + kind 1 fallback)
 * and building the final `InsertResult`.
 *
 * This logic is used by both:
 * - `UploadTab.svelte` (normal fresh-upload flow)
 * - `MediaWidget.svelte` (pending-upload recovery flow)
 *
 * Extracting it avoids duplicating the publish + InsertResult build logic.
 */

import type { BlossomSigner } from './types';
import type { ImageMetadataInput } from './metadata';
import type { InsertResult } from '../widget/types';
import { buildImageMetadataTags } from './metadata';
import { publishEvent } from './publish';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublishMediaOptions {
  /** Active signer for event signing */
  signer: BlossomSigner;
  /** Relay URLs for publishing */
  relayUrls: string[];
  /** Primary URL of the uploaded blob */
  url: string;
  /** MIME type of the file */
  mime: string;
  /** Upload tags (including preview refs) */
  uploadTags: string[][];
  /** User-provided metadata */
  metadata: ImageMetadataInput;
}

export interface PublishMediaResult {
  /** The constructed InsertResult */
  insertResult: InsertResult;
  /** IDs of published Nostr events */
  publishedEventIds: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTagValue(tags: string[][], name: string): string | undefined {
  return tags.find((t) => t[0] === name)?.[1];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Publish NIP-94 (kind 1063) and kind 1 fallback events for a media upload,
 * then build the `InsertResult` payload.
 *
 * @throws If signing or publishing fails irrecoverably.
 */
export async function publishMediaMetadata(
  options: PublishMediaOptions,
): Promise<PublishMediaResult> {
  const { signer, relayUrls, url, mime, uploadTags, metadata } = options;

  const kind1063Tags = buildImageMetadataTags(uploadTags, metadata);

  const publishedEventIds: string[] = [];

  if (relayUrls.length > 0) {
    const res1063 = await publishEvent(signer, relayUrls, metadata.description, kind1063Tags, 1063);
    const id1063 = (res1063.event as Record<string, unknown> | null)?.id;
    if (typeof id1063 === 'string') publishedEventIds.push(id1063);
  }

  const sha256 = getTagValue(uploadTags, 'x');
  const thumbUrl = getTagValue(uploadTags, 'thumb');
  const previewUrl = getTagValue(uploadTags, 'image') ?? thumbUrl;
  const sizeStr = getTagValue(uploadTags, 'size');

  const insertResult: InsertResult = {
    url,
    thumbnailUrl: thumbUrl,
    previewUrl: previewUrl,
    mimeType: mime,
    sha256,
    size: sizeStr ? Number(sizeStr) : undefined,
    description: metadata.description,
    alt: metadata.altAttribution,
    author: metadata.author,
    license: metadata.license,
    licenseLabel: metadata.licenseLabel,
    genre: metadata.genre,
    keywords: metadata.keywords,
    tags: uploadTags,
  };

  return { insertResult, publishedEventIds };
}
