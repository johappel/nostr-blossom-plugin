/**
 * Pending-upload tracker — localStorage-backed persistence for Blossom
 * uploads that have been sent to the server but not yet published as
 * NIP-94 events.
 *
 * When a user uploads a file and then closes the dialog (or the browser
 * crashes) before the metadata form is submitted, the file is left orphaned
 * on the Blossom server. This module stores a lightweight "pending" record
 * immediately after a successful upload and removes it after a successful
 * NIP-94 publish. On the next widget-open the host can read the pending
 * list and offer the user to either complete or delete those uploads.
 *
 * All functions are pure / framework-agnostic.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A pending upload that was sent to Blossom but not yet published.
 */
export interface PendingUpload {
  /** Unique identifier (crypto.randomUUID or fallback) */
  id: string;
  /** Primary URL of the uploaded blob on the Blossom server */
  url: string;
  /** SHA-256 hash of the original file */
  sha256?: string;
  /** MIME type */
  mime: string;
  /** Original file name */
  fileName: string;
  /** All upload tags (including preview refs) — needed for the metadata form */
  uploadTags: string[][];
  /** Blossom servers the file was uploaded to (needed for deletion) */
  servers: string[];
  /** SHA-256 hashes of derivative blobs (thumb, image preview) */
  relatedHashes: string[];
  /** URLs of derivative blobs (thumb, image preview) */
  relatedUrls: string[];
  /** Unix-ms timestamp when the upload was completed */
  createdAt: number;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function storageKey(appId: string): string {
  return `blossom-pending:${appId}`;
}

/**
 * Generate a unique ID for a pending upload.
 * Uses `crypto.randomUUID()` when available, falls back to a simple random hex string.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: 16 random hex chars
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Load all pending uploads from localStorage.
 * Returns an empty array when nothing is stored or parsing fails.
 */
export function loadPendingUploads(appId = 'default'): PendingUpload[] {
  try {
    const raw = localStorage.getItem(storageKey(appId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PendingUpload[];
  } catch {
    return [];
  }
}

/**
 * Add a pending upload to localStorage.
 *
 * Call this **immediately** after a successful `bridge.uploadFile()` — before
 * the user enters metadata. The record is removed later by
 * `removePendingUpload()` after a successful NIP-94 publish.
 *
 * @returns The generated `PendingUpload` (including its `id`).
 */
export function savePendingUpload(
  appId: string,
  data: Omit<PendingUpload, 'id'>,
): PendingUpload {
  const pending: PendingUpload = { ...data, id: generateId() };
  const existing = loadPendingUploads(appId);
  existing.unshift(pending);

  try {
    localStorage.setItem(storageKey(appId), JSON.stringify(existing));
  } catch (err) {
    console.warn('[pending-uploads] Failed to write localStorage:', err);
  }

  return pending;
}

/**
 * Remove a single pending upload by its ID.
 * Call after successful NIP-94 publish or after the user chooses to delete
 * the orphaned upload from the server.
 */
export function removePendingUpload(appId: string, id: string): void {
  const existing = loadPendingUploads(appId);
  const filtered = existing.filter((p) => p.id !== id);

  try {
    if (filtered.length === 0) {
      localStorage.removeItem(storageKey(appId));
    } else {
      localStorage.setItem(storageKey(appId), JSON.stringify(filtered));
    }
  } catch (err) {
    console.warn('[pending-uploads] Failed to update localStorage:', err);
  }
}

/**
 * Remove a pending upload by its URL.
 * Useful when the caller only knows the URL (e.g. direct insert without metadata).
 */
export function removePendingUploadByUrl(appId: string, url: string): void {
  const existing = loadPendingUploads(appId);
  const filtered = existing.filter((p) => p.url !== url);

  try {
    if (filtered.length === 0) {
      localStorage.removeItem(storageKey(appId));
    } else {
      localStorage.setItem(storageKey(appId), JSON.stringify(filtered));
    }
  } catch (err) {
    console.warn('[pending-uploads] Failed to update localStorage:', err);
  }
}

/**
 * Remove all pending uploads for a given appId.
 */
export function clearAllPendingUploads(appId: string): void {
  try {
    localStorage.removeItem(storageKey(appId));
  } catch (err) {
    console.warn('[pending-uploads] Failed to clear localStorage:', err);
  }
}

/**
 * Extract related hashes and URLs from upload tags (thumb / image entries).
 *
 * Upload tags may contain entries like:
 *   `['thumb', 'https://…/abc123.webp', 'abc123…']`
 *   `['image', 'https://…/def456.webp', 'def456…']`
 *
 * This helper extracts the URLs and SHA-256 hashes so they can be stored
 * in the `PendingUpload` for later cleanup.
 */
export function extractRelatedFromTags(uploadTags: string[][]): {
  relatedHashes: string[];
  relatedUrls: string[];
} {
  const hashes: string[] = [];
  const urls: string[] = [];

  for (const tag of uploadTags) {
    if (tag[0] === 'thumb' || tag[0] === 'image') {
      if (tag[1]) urls.push(tag[1]);
      if (tag[2] && /^[0-9a-f]{64}$/i.test(tag[2])) hashes.push(tag[2].toLowerCase());
    }
  }

  return { relatedHashes: hashes, relatedUrls: urls };
}
