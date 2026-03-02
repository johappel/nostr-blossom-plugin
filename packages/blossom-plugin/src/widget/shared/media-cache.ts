export interface MediaCacheEnvelope<T> {
  ts: number;
  items: T[];
}

const PREFIX = 'blossom:media-cache:v1:';

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function makeCacheKey(namespace: string, parts: Array<string | undefined | null>): string {
  const normalized = parts.map((p) => (p ?? '').trim()).join('|');
  return `${PREFIX}${namespace}:${normalized}`;
}

export function readCache<T>(key: string, maxAgeMs: number): { items: T[]; stale: boolean } | null {
  if (!hasLocalStorage()) return null;

  const parsed = safeParse<MediaCacheEnvelope<T>>(localStorage.getItem(key));
  if (!parsed || !Array.isArray(parsed.items) || typeof parsed.ts !== 'number') return null;

  const stale = Date.now() - parsed.ts > maxAgeMs;
  return { items: parsed.items, stale };
}

export function writeCache<T>(key: string, items: T[], maxItems = 500): void {
  if (!hasLocalStorage()) return;

  const capped = items.slice(0, Math.max(1, maxItems));
  const payload: MediaCacheEnvelope<T> = { ts: Date.now(), items: capped };

  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore quota/runtime errors to keep runtime flow unaffected.
  }
}

export function clearCache(key: string): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}
