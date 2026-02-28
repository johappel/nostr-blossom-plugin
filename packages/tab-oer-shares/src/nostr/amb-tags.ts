/**
 * AMB Tag Builder
 *
 * Converts NIP-94 metadata into AMB form data (auto-mapping) and
 * builds the full kind:30142 tag array from form data per NIP-AMB spec.
 *
 * @see https://github.com/edufeed-org/nips/blob/edufeed-amb/AMB.md
 */

import type { Nip94FileEvent } from '@blossom/plugin/plugin';
import type { AmbFormData, SkosSelection } from './types';

// ── License URL normalization ────────────────────────────────────────────────

const LICENSE_URLS: Record<string, string> = {
  'cc0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'cc-by': 'https://creativecommons.org/licenses/by/4.0/',
  'cc-by-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'cc-by-sa': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'cc-by-sa-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'cc-by-nc': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'cc-by-nc-4.0': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'cc-by-nc-sa': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'cc-by-nc-sa-4.0': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'cc-by-nd': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'cc-by-nd-4.0': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'cc-by-nc-nd': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  'cc-by-nc-nd-4.0': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
};

/**
 * Normalize a license string (SPDX-like short name or full URL) to its
 * canonical URL. Returns the input if it's already a URL.
 */
function normalizeLicenseUrl(license: string): string {
  if (!license) return '';
  // Already a URL
  if (license.startsWith('http://') || license.startsWith('https://')) {
    return license;
  }
  const key = license.toLowerCase().trim();
  return LICENSE_URLS[key] ?? license;
}

// ── NIP-94 → AMB auto-mapping ────────────────────────────────────────────────

/**
 * Map a NIP-94 file event into pre-filled AMB form data.
 *
 * Mapping:
 * - alt → name
 * - summary / content → description
 * - author → creatorName
 * - license → licenseUrl (normalized)
 * - t tags → keywords
 * - url → encodingUrl
 * - mime → encodingFormat
 * - sha256 → encodingSha256
 * - thumbUrl / imageUrl → imageUrl
 */
export function mapNip94ToAmb(nip94: Nip94FileEvent): AmbFormData {
  const meta = nip94.metadata;

  // Extract keywords from t-tags
  const keywords: string[] = [];
  if (nip94.tags) {
    for (const tag of nip94.tags) {
      if (tag[0] === 't' && tag[1]) {
        keywords.push(tag[1]);
      }
    }
  }

  // Find size tag
  let encodingSize: string | undefined;
  if (nip94.tags) {
    for (const tag of nip94.tags) {
      if (tag[0] === 'size' && tag[1]) {
        encodingSize = tag[1];
        break;
      }
    }
  }

  // ImageMetadataInput uses altAttribution/description; map to AMB name/description
  return {
    name: meta?.altAttribution ?? nip94.content ?? '',
    description: meta?.description ?? nip94.content ?? '',
    keywords: meta?.keywords?.length ? meta.keywords : keywords,
    creatorName: meta?.author || undefined,
    creatorPubkey: undefined, // Will be set from signer
    licenseUrl: normalizeLicenseUrl(meta?.license ?? ''),
    audience: [],
    educationalLevel: [],
    learningResourceType: [],
    about: [],
    inLanguage: 'de',
    isAccessibleForFree: true,
    encodingUrl: nip94.url,
    encodingFormat: nip94.mime,
    encodingSha256: nip94.sha256,
    encodingSize,
    imageUrl: nip94.thumbUrl ?? nip94.imageUrl ?? undefined,
  };
}

// ── AMB tag builder ──────────────────────────────────────────────────────────

/**
 * Append SKOS concept tags for a given AMB property.
 *
 * Each concept produces:
 *   ["<prop>:id", <uri>]
 *   ["<prop>:prefLabel:de", <label>]
 *   ["<prop>:type", "Concept"]
 */
function appendConceptTags(
  tags: string[][],
  propName: string,
  selections: SkosSelection[],
): void {
  for (const sel of selections) {
    tags.push([`${propName}:id`, sel.id]);
    tags.push([`${propName}:prefLabel:de`, sel.prefLabel]);
    tags.push([`${propName}:type`, 'Concept']);
  }
}

/**
 * Build the complete kind:30142 tag array from AMB form data.
 *
 * Follows the NIP-AMB flattening rules and property mappings.
 *
 * @param form       - Validated form data
 * @param relayHint  - Optional relay hint for the creator p-tag
 * @param dTagOverride - Use this d-tag instead of deriving from encodingUrl
 * @returns          Tag array ready for event signing
 */
export function buildAmbEventTags(
  form: AmbFormData,
  relayHint = '',
  dTagOverride?: string,
): string[][] {
  // Use override, then encodingUrl, then random fallback
  const dTag = dTagOverride ?? form.encodingUrl ?? `oer-${Date.now()}`;

  const tags: string[][] = [];

  // ── General ──
  tags.push(['d', dTag]);
  tags.push(['type', 'LearningResource']);
  tags.push(['name', form.name]);
  tags.push(['description', form.description]);

  // Keywords → Nostr-native t tags
  for (const kw of form.keywords) {
    if (kw.trim()) tags.push(['t', kw.trim()]);
  }

  // Language
  if (form.inLanguage) {
    tags.push(['inLanguage', form.inLanguage]);
  }

  // ── Provenance ──
  // Nostr-native creator (p tag) if pubkey available
  if (form.creatorPubkey) {
    tags.push(['p', form.creatorPubkey, relayHint, 'creator']);
  }

  // External creator fallback (name only, no Nostr identity)
  if (form.creatorName && !form.creatorPubkey) {
    tags.push(['creator:name', form.creatorName]);
    tags.push(['creator:type', 'Person']);
  }

  tags.push(['datePublished', new Date().toISOString().split('T')[0]]);

  // ── Costs and Rights ──
  if (form.licenseUrl) {
    tags.push(['license:id', form.licenseUrl]);
  }
  tags.push(['isAccessibleForFree', form.isAccessibleForFree ? 'true' : 'false']);

  // ── Educational ──
  appendConceptTags(tags, 'audience', form.audience);
  appendConceptTags(tags, 'educationalLevel', form.educationalLevel);
  appendConceptTags(tags, 'learningResourceType', form.learningResourceType);
  appendConceptTags(tags, 'about', form.about);

  // ── Technical / Encoding ──
  if (form.encodingUrl) {
    tags.push(['encoding:type', 'MediaObject']);
    tags.push(['encoding:contentUrl', form.encodingUrl]);
    if (form.encodingFormat) {
      tags.push(['encoding:encodingFormat', form.encodingFormat]);
    }
    if (form.encodingSha256) {
      tags.push(['encoding:sha256', form.encodingSha256]);
    }
    if (form.encodingSize) {
      tags.push(['encoding:contentSize', form.encodingSize]);
    }
  }

  // Thumbnail / preview image
  if (form.imageUrl) {
    tags.push(['image', form.imageUrl]);
  }

  return tags;
}
