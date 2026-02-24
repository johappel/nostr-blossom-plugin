import { writable } from 'svelte/store';

export interface UploadHistoryItem {
  url: string;
  mime?: string;
  createdAt: string;
}

export const uploadHistoryStore = writable<UploadHistoryItem[]>([]);

export function addUploadHistory(item: UploadHistoryItem) {
  uploadHistoryStore.update((items) => [item, ...items]);
}
