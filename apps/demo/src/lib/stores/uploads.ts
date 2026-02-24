import { writable } from 'svelte/store';

export interface UploadHistoryItem {
  url: string;
  mime?: string;
  createdAt: string;
  metadata?: {
    description: string;
    author: string;
    license: string;
    keywords: string[];
    altAttribution: string;
  };
  publishedKinds?: number[];
}

export const uploadHistoryStore = writable<UploadHistoryItem[]>([]);

export function addUploadHistory(item: UploadHistoryItem) {
  uploadHistoryStore.update((items) => [item, ...items]);
}
