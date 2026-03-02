// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { loadAmbSharesWithCache } from './load-shares-with-cache';
import type { AmbShareItem } from './types';
import {
  makeCacheKey,
  readCache,
  writeCache,
} from '../../../blossom-plugin/src/widget/shared/media-cache';

const cacheOps = { makeCacheKey, readCache, writeCache };

function makeShare(id: string, name = `Share ${id}`): AmbShareItem {
  return {
    eventId: id,
    dTag: `d-${id}`,
    createdAt: 1,
    pubkey: 'pubkey',
    name,
    description: `Description ${id}`,
    keywords: [],
    audience: [],
    educationalLevel: [],
    learningResourceType: [],
    about: [],
    encodingUrl: `https://example.com/${id}.png`,
  };
}

describe('loadAmbSharesWithCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns fresh shares and writes cache when fetch succeeds', async () => {
    const fresh = [makeShare('fresh-1')];
    const fetchShares = vi.fn().mockResolvedValue(fresh);

    const result = await loadAmbSharesWithCache({
      pubkey: 'pk1',
      relayUrl: 'wss://relay.example',
      ttlMs: 60_000,
      maxItems: 500,
      fetchShares,
      cacheOps,
    });

    expect(result.fromCacheOnly).toBe(false);
    expect(result.hadCached).toBe(false);
    expect(result.shares).toEqual(fresh);
    expect(fetchShares).toHaveBeenCalledWith('pk1', 'wss://relay.example');

    const cacheKey = makeCacheKey('oer-shares', ['pk1', 'wss://relay.example']);
    const cached = readCache<AmbShareItem>(cacheKey, 60_000);
    expect(cached?.items).toEqual(fresh);
  });

  it('falls back to cached shares when fetch fails', async () => {
    const cacheKey = makeCacheKey('oer-shares', ['pk1', 'wss://relay.example']);
    const cachedShares = [makeShare('cached-1')];
    writeCache(cacheKey, cachedShares, 500);

    const fetchShares = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await loadAmbSharesWithCache({
      pubkey: 'pk1',
      relayUrl: 'wss://relay.example',
      ttlMs: 60_000,
      maxItems: 500,
      fetchShares,
      cacheOps,
    });

    expect(result.hadCached).toBe(true);
    expect(result.fromCacheOnly).toBe(true);
    expect(result.shares).toEqual(cachedShares);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('throws when fetch fails and no cache exists', async () => {
    const fetchShares = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      loadAmbSharesWithCache({
        pubkey: 'pk1',
        relayUrl: 'wss://relay.example',
        ttlMs: 60_000,
        maxItems: 500,
        fetchShares,
        cacheOps,
      }),
    ).rejects.toThrow('network down');
  });
});
