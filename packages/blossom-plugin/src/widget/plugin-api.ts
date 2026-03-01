/**
 * @blossom/plugin/plugin — Public API for Tab Plugin Authors
 *
 * This module re-exports all types and utilities that external tab plugins
 * need.  Plugin packages should depend on `@blossom/plugin` and import
 * from `@blossom/plugin/plugin`:
 *
 * ```ts
 * import type { TabPlugin, WidgetContext, InsertResult } from '@blossom/plugin/plugin';
 * ```
 */

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  TabPlugin,
  ShareTarget,
  WidgetContext,
  WidgetEventMap,
  InsertResult,
  InsertMode,
  BlossomMediaFeatures,
  CustomTab,
  MediaDisplayItem,
} from './types';

export type { BlossomSigner } from '../core/types';
export type { UploadHistoryItem } from '../core/history';
export type { Nip94FetchResult, Nip94FileEvent } from '../core/nip94';
export type { BlossomUserSettings } from '../core/settings';
export type { NostrProfile } from '../core/profile';
export type { PublishEventResult, PublishRelayResult } from '../core/publish';

// ── Utilities useful for plugin authors ──────────────────────────────────────
export { formatInsertResult, INSERT_MODE_LABELS } from '../core/format';
export { publishEvent } from '../core/publish';
export { fetchProfile, shortenPubkey } from '../core/profile';

// ── Shared UI components ─────────────────────────────────────────────────────
export { default as MediaCard } from './shared/MediaCard.svelte';
export { default as MediaDetailSheet } from './shared/MediaDetailSheet.svelte';
export { default as MediaToolbar } from './shared/MediaToolbar.svelte';

// ── Icons ────────────────────────────────────────────────────────────────────
export {
  iconUploadFile,
  iconGallery,
  iconAutoAwesome,
  iconSync,
  iconEdit,
  iconTune,
  iconCheck,
  iconWarning,
  iconPublic,
  iconGroups,
  iconSchool,
} from './icons';
