/**
 * Types for the OER-Shares (AMB / Edufeed) plugin.
 *
 * kind:30142 — AMB Metadata Event (addressable replaceable)
 */

// ── SKOS Vocabulary ──────────────────────────────────────────────────────────

/** A single SKOS concept parsed from SkoHub JSON-LD. */
export interface SkosConcept {
  /** Concept URI (e.g. "https://w3id.org/kim/educationalLevel/level_2"). */
  id: string;
  /** German preferred label. */
  prefLabel: string;
  /** Narrower (child) concepts — used for hierarchical vocabularies. */
  children?: SkosConcept[];
}

/** A user-selected SKOS concept (id + label pair). */
export interface SkosSelection {
  id: string;
  prefLabel: string;
}

// ── AMB Form Data ────────────────────────────────────────────────────────────

/** Fields collected by the OER share form, ready for tag building. */
export interface AmbFormData {
  /** Resource title (AMB `name`). */
  name: string;
  /** Description / summary. */
  description: string;
  /** Optional long-form content (used as Nostr event body). */
  content?: string;
  /** Keywords / tags. */
  keywords: string[];
  /** Creator display name (non-Nostr fallback). */
  creatorName?: string;
  /** Creator Nostr pubkey (hex) — used for native `p` tag. */
  creatorPubkey?: string;
  /** License URI (e.g. CC-BY-4.0 URL). */
  licenseUrl?: string;
  /** Target audience selections. */
  audience: SkosSelection[];
  /** Educational level selections. */
  educationalLevel: SkosSelection[];
  /** Learning resource type selections. */
  learningResourceType: SkosSelection[];
  /** Subject / topic (about) selections. */
  about: SkosSelection[];
  /** Language code (default: "de"). */
  inLanguage: string;
  /** Free to access. */
  isAccessibleForFree: boolean;

  // ── Encoding / technical info from NIP-94 ──
  /** Blob/file URL. */
  encodingUrl?: string;
  /** MIME type. */
  encodingFormat?: string;
  /** SHA-256 hash. */
  encodingSha256?: string;
  /** File size in bytes. */
  encodingSize?: string;
  /** Thumbnail / image URL. */
  imageUrl?: string;
}

// ── AMB Share Item (parsed from kind:30142 event) ────────────────────────────

/** An AMB share as retrieved from the relay, with prefLabels resolved. */
export interface AmbShareItem {
  /** Nostr event ID. */
  eventId: string;
  /** `d` tag value — addressable identifier. */
  dTag: string;
  /** Event created_at timestamp. */
  createdAt: number;
  /** Author pubkey. */
  pubkey: string;

  // ── AMB metadata ──
  name: string;
  description: string;
  /** Optional long-form content body. */
  content?: string;
  keywords: string[];

  /** Audience concepts with prefLabels. */
  audience: SkosSelection[];
  /** Educational level concepts. */
  educationalLevel: SkosSelection[];
  /** Learning resource type concepts. */
  learningResourceType: SkosSelection[];
  /** Subject / about concepts. */
  about: SkosSelection[];

  /** License URI. */
  licenseId?: string;
  /** Creator name (from flattened tags or resolved from p-tag). */
  creatorName?: string;
  /** Language. */
  inLanguage?: string;
  /** Free access flag. */
  isAccessibleForFree?: boolean;

  /** Primary content URL. */
  encodingUrl?: string;
  /** Thumbnail / preview image URL. */
  imageUrl?: string;
}
