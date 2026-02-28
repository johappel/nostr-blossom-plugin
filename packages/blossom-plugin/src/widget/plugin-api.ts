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
  WidgetContext,
  WidgetEventMap,
  InsertResult,
  InsertMode,
  BlossomMediaFeatures,
  CustomTab,
} from './types';

export type { BlossomSigner } from '../core/types';
export type { UploadHistoryItem } from '../core/history';
export type { Nip94FetchResult, Nip94FileEvent } from '../core/nip94';
export type { BlossomUserSettings } from '../core/settings';

// ── Utilities useful for plugin authors ──────────────────────────────────────
export { formatInsertResult } from '../core/format';
