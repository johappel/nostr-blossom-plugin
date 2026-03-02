import type { AmbShareItem } from './types';

export interface CacheOps {
  makeCacheKey: (namespace: string, parts: Array<string | undefined | null>) => string;
  readCache: <T>(key: string, maxAgeMs: number) => { items: T[]; stale: boolean } | null;
  writeCache: <T>(key: string, items: T[], maxItems?: number) => void;
}

export interface LoadAmbSharesWithCacheOptions {
  pubkey: string;
  relayUrl: string;
  ttlMs: number;
  maxItems: number;
  fetchShares: (pubkey: string, relayUrl: string) => Promise<AmbShareItem[]>;
  cacheOps: CacheOps;
}

export interface LoadAmbSharesWithCacheResult {
  shares: AmbShareItem[];
  hadCached: boolean;
  cacheKey: string;
  fromCacheOnly: boolean;
  error?: unknown;
}

export async function loadAmbSharesWithCache(
  options: LoadAmbSharesWithCacheOptions,
): Promise<LoadAmbSharesWithCacheResult> {
  const { pubkey, relayUrl, ttlMs, maxItems, fetchShares, cacheOps } = options;
  const cacheKey = cacheOps.makeCacheKey('oer-shares', [pubkey, relayUrl]);

  const cached = cacheOps.readCache<AmbShareItem>(cacheKey, ttlMs);
  const cachedShares = cached?.items ?? [];
  const hadCached = cachedShares.length > 0;

  try {
    const fresh = await fetchShares(pubkey, relayUrl);
    cacheOps.writeCache(cacheKey, fresh, maxItems);
    return {
      shares: fresh,
      hadCached,
      cacheKey,
      fromCacheOnly: false,
    };
  } catch (error) {
    if (hadCached) {
      return {
        shares: cachedShares,
        hadCached: true,
        cacheKey,
        fromCacheOnly: true,
        error,
      };
    }
    throw error;
  }
}
