/**
 * Svelte-reactive upload history store for the demo app.
 *
 * The UploadHistoryItem type and pure CRUD helpers live in
 * @blossom/plugin/core; this module wraps them in a Svelte writable store.
 */
import { writable } from 'svelte/store';
import {
  addHistoryItem,
  updateHistoryItemByUrl,
  removeHistoryItemByUrl,
} from '@blossom/plugin/core';

export type { UploadHistoryItem } from '@blossom/plugin/core';

import type { UploadHistoryItem } from '@blossom/plugin/core';

export const uploadHistoryStore = writable<UploadHistoryItem[]>([]);

export function addUploadHistory(item: UploadHistoryItem) {
  uploadHistoryStore.update((items) => addHistoryItem(items, item));
}

export function updateLatestUploadHistoryByUrl(
  url: string,
  updates: Partial<
    Pick<
      UploadHistoryItem,
      'mime' | 'metadata' | 'publishedKinds' | 'publishedEventIds' | 'sha256' | 'uploadTags'
    >
  >,
) {
  uploadHistoryStore.update((items) => updateHistoryItemByUrl(items, url, updates));
}

export function removeUploadHistoryByUrl(url: string) {
  uploadHistoryStore.update((items) => removeHistoryItemByUrl(items, url));
}
