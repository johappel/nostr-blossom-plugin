import { writable } from 'svelte/store';

export interface UploadHistoryItem {
  url: string;
  mime?: string;
  createdAt: string;
  metadata?: {
    description: string;
    author: string;
    license: string;
    licenseLabel?: string;
    keywords: string[];
    altAttribution: string;
  };
  publishedKinds?: number[];
}

export const uploadHistoryStore = writable<UploadHistoryItem[]>([]);

export function addUploadHistory(item: UploadHistoryItem) {
  uploadHistoryStore.update((items) => [item, ...items]);
}

export function updateLatestUploadHistoryByUrl(
  url: string,
  updates: Partial<Pick<UploadHistoryItem, 'mime' | 'metadata' | 'publishedKinds'>>,
) {
  uploadHistoryStore.update((items) => {
    const index = items.findIndex((item) => item.url === url);
    if (index < 0) {
      return items;
    }

    const nextItems = [...items];
    nextItems[index] = {
      ...nextItems[index],
      ...updates,
    };

    return nextItems;
  });
}
