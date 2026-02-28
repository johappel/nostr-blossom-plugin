/**
 * File metadata types and Nostr tag-builder functions.
 *
 * Provides `ImageMetadataInput` and helpers for constructing NIP-94 (kind 1063)
 * and kind 1 fallback tags from Blossom upload results.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** AI authorship annotation for a media file. */
export type AiImageMode = 'generated' | 'assisted';

/**
 * Structured metadata collected from the user (or suggested by AI) for a
 * single uploaded file.
 *
 * Used to build NIP-94 kind 1063 tags and kind 1 fallback tags.
 */
export interface ImageMetadataInput {
  /** Long-form human description of the image / file (maps to `summary` tag) */
  description: string;
  /**
   * Short alt-text / attribution string (maps to `alt` tag).
   * Often identical to description for accessibility, but can differ.
   */
  altAttribution: string;
  /** Author / creator name (maps to `author` tag). Empty = omit tag. */
  author: string;
  /** Canonical license URI (maps to `license` tag[1]). Empty = omit tag. */
  license: string;
  /** Short license label, e.g. 'CC-BY-4.0' (maps to `license` tag[2]). */
  licenseLabel?: string;
  /** Visual style / genre, e.g. "photorealistic", "aquarell" (maps to `genre` tag). */
  genre?: string;
  /** Keyword tags — each becomes a `t` tag. */
  keywords: string[];
  /**
   * Indicates whether the image itself was AI-generated or AI-assisted.
   * Undefined = not AI-related. Maps to `hint` tags.
   */
  aiImageMode?: AiImageMode;
  /**
   * True if description / keywords were generated with AI assistance.
   * Maps to `hint: ai-metadata-generated` tag.
   */
  aiMetadataGenerated?: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildLicenseTag(metadata: ImageMetadataInput): string[] | null {
  const canonical = metadata.license.trim();
  const label = metadata.licenseLabel?.trim() ?? '';

  if (!canonical && label) {
    throw new Error('License label requires a canonical license value.');
  }

  if (!canonical) return null;
  if (!label) return ['license', canonical];
  return ['license', canonical, label];
}

function buildAiHintTags(metadata: ImageMetadataInput): string[][] {
  const tags: string[][] = [];

  if (metadata.aiImageMode === 'generated') tags.push(['hint', 'ai-image-generated']);
  if (metadata.aiImageMode === 'assisted') tags.push(['hint', 'ai-image-assisted']);
  if (metadata.aiMetadataGenerated) tags.push(['hint', 'ai-metadata-generated']);

  return tags;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the full NIP-94 (kind 1063) tag set from Blossom upload tags and
 * user metadata.
 *
 * The following upload tags are passed through as-is:
 * `url`, `m`, `x`, `size`, `dim`, `blurhash`, `thumb`, `image`
 *
 * Additional tags are added:
 * `summary`, `alt`, `author`, `license`, `genre`, `t` (keywords), `hint` (AI)
 *
 * @param uploadTags - Tags returned by the Blossom upload (NIP-94 subset)
 * @param metadata   - User-provided / AI-suggested metadata
 */
export function buildImageMetadataTags(
  uploadTags: string[][],
  metadata: ImageMetadataInput,
): string[][] {
  const passthroughKeys = new Set([
    'url', 'm', 'x', 'size', 'dim', 'blurhash', 'thumb', 'image',
  ]);

  const passthroughTags = uploadTags.filter(
    (tag) => tag[0] && passthroughKeys.has(tag[0]),
  );

  const tags: string[][] = [
    ...passthroughTags,
    ['summary', metadata.description],
    ['alt', metadata.altAttribution],
  ];

  if (metadata.author.trim()) tags.push(['author', metadata.author.trim()]);

  const licenseTag = buildLicenseTag(metadata);
  if (licenseTag) tags.push(licenseTag);

  if (metadata.genre?.trim()) tags.push(['genre', metadata.genre.trim()]);

  for (const keyword of metadata.keywords) {
    const kw = keyword.trim();
    if (kw) tags.push(['t', kw]);
  }

  tags.push(...buildAiHintTags(metadata));

  return tags;
}



// ─── Display helpers ──────────────────────────────────────────────────────────

/** Format AI mode for display, e.g. in history lists. Returns '—' if not set. */
export function formatAiImageMode(mode?: AiImageMode): string {
  if (mode === 'generated') return 'KI generiert';
  if (mode === 'assisted') return 'Mit Hilfe von KI generiert';
  return '—';
}

/**
 * Summarise all AI hint tags as a comma-separated string for display.
 * Returns '—' if no AI hints are present.
 */
export function formatAiHints(metadata?: {
  aiImageMode?: AiImageMode;
  aiMetadataGenerated?: boolean;
}): string {
  const hints: string[] = [];

  if (metadata?.aiImageMode === 'generated') hints.push('hint: ai-image-generated');
  if (metadata?.aiImageMode === 'assisted') hints.push('hint: ai-image-assisted');
  if (metadata?.aiMetadataGenerated) hints.push('hint: ai-metadata-generated');

  return hints.length > 0 ? hints.join(', ') : '—';
}
