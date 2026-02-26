import { writable } from 'svelte/store';

export interface UploadHistoryItem {
  url: string;
  mime?: string;
  createdAt: string;
  /** SHA-256 hash of the original file (from the `x` tag) */
  sha256?: string;
  /** Tags returned from the upload (includes thumb/image refs) */
  uploadTags?: string[][];
  metadata?: {
    description: string;
    author: string;
    license: string;
    licenseLabel?: string;
    genre?: string;
    keywords: string[];
    altAttribution: string;
    aiImageMode?: 'generated' | 'assisted';
    aiMetadataGenerated?: boolean;
  };
  publishedKinds?: number[];
  /** Event IDs of published Nostr events (kind 1063, kind 1 etc.) */
  publishedEventIds?: string[];
}

export const uploadHistoryStore = writable<UploadHistoryItem[]>([]);

export function addUploadHistory(item: UploadHistoryItem) {
  uploadHistoryStore.update((items) => [item, ...items]);
}

export function updateLatestUploadHistoryByUrl(
  url: string,
  updates: Partial<Pick<UploadHistoryItem, 'mime' | 'metadata' | 'publishedKinds' | 'publishedEventIds' | 'sha256' | 'uploadTags'>>,
) {
  uploadHistoryStore.update((items) => {
    const index = items.findIndex((item) => item.url === url);
    if (index < 0) {
      return items;
    }

    const nextItems = [...items];
    const existing = nextItems[index];
    nextItems[index] = {
      ...existing,
      ...updates,
      publishedEventIds: [
        ...(existing.publishedEventIds ?? []),
        ...(updates.publishedEventIds ?? []),
      ],
    };

    return nextItems;
  });
}

export function removeUploadHistoryByUrl(url: string) {
  uploadHistoryStore.update((items) => items.filter((item) => item.url !== url));
}
