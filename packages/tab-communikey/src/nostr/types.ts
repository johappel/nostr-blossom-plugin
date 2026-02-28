/**
 * Types for the Communikey protocol.
 *
 * kind:10222 — Community definition (replaceable)
 * kind:30222 — Targeted publication (addressable replaceable)
 * kind:30382 — Relationship / membership (addressable replaceable)
 */

// ── Community info (resolved from kind:10222 + kind:0 profile) ───────────────

export interface CommunityInfo {
  /** Community pubkey (= unique community ID). */
  pubkey: string;
  /** Display name (from kind:0 profile of the community pubkey). */
  name?: string;
  /** Avatar picture URL (from kind:0 profile). */
  picture?: string;
  /** Relay URLs where the community operates (from kind:10222 `r` tags). */
  relays: string[];
  /** Blossom server URLs (from kind:10222 `blossom` tags). */
  blossomUrls: string[];
  /** Content sections defined by the community. */
  contentSections: ContentSection[];
}

export interface ContentSection {
  /** Section name (from `content` tag). */
  name: string;
  /** Allowed event kinds in this section (from `k` tags). */
  allowedKinds: number[];
}

// ── Membership ───────────────────────────────────────────────────────────────

export interface CommunityMembership {
  /** The community pubkey. */
  communityPubkey: string;
  /** Optional relay hint for the community's primary relay. */
  relayHint?: string;
}

// ── Community media item ─────────────────────────────────────────────────────

export interface CommunityMediaItem {
  /** The kind:30222 event ID. */
  shareEventId: string;
  /** The referenced original event ID (NIP-94 kind:1063). */
  originalEventId: string;
  /** The original event kind (usually 1063). */
  originalKind: number;
  /** Pubkey of the author who shared this. */
  sharedBy: string;
  /** Timestamp of the share event. */
  sharedAt: number;
  /** Target community pubkeys. */
  targetCommunities: string[];
}
