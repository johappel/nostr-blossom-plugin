// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearCache, makeCacheKey, readCache, writeCache } from './media-cache';

describe('media-cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds deterministic cache keys', () => {
    const key = makeCacheKey('oer-shares', ['pubkey', 'wss://relay.example']);
    expect(key).toBe('blossom:media-cache:v1:oer-shares:pubkey|wss://relay.example');
  });

  it('normalizes missing parts in key generation', () => {
    const key = makeCacheKey('gallery', ['pk', undefined, null, ' relay ']);
    expect(key).toBe('blossom:media-cache:v1:gallery:pk|||relay');
  });

  it('writes and reads fresh cache payload', () => {
    const key = makeCacheKey('community-media', ['pk1', 'communityA']);
    writeCache(key, [{ id: 1 }, { id: 2 }], 500);

    const result = readCache<{ id: number }>(key, 60_000);
    expect(result).not.toBeNull();
    expect(result?.stale).toBe(false);
    expect(result?.items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('marks cache as stale when older than maxAge', () => {
    const key = makeCacheKey('gallery', ['pk1']);
    localStorage.setItem(
      key,
      JSON.stringify({
        ts: Date.now() - 120_000,
        items: [{ id: 'old' }],
      }),
    );

    const result = readCache<{ id: string }>(key, 1_000);
    expect(result).not.toBeNull();
    expect(result?.stale).toBe(true);
    expect(result?.items).toEqual([{ id: 'old' }]);
  });

  it('returns null for invalid json or invalid shape', () => {
    const keyA = makeCacheKey('oer', ['a']);
    localStorage.setItem(keyA, '{broken');
    expect(readCache(keyA, 10_000)).toBeNull();

    const keyB = makeCacheKey('oer', ['b']);
    localStorage.setItem(keyB, JSON.stringify({ ts: 'nope', items: [] }));
    expect(readCache(keyB, 10_000)).toBeNull();

    const keyC = makeCacheKey('oer', ['c']);
    localStorage.setItem(keyC, JSON.stringify({ ts: Date.now(), items: {} }));
    expect(readCache(keyC, 10_000)).toBeNull();
  });

  it('caps cached item count with maxItems', () => {
    const key = makeCacheKey('oer', ['pk1']);
    writeCache(key, [1, 2, 3, 4], 2);

    const result = readCache<number>(key, 60_000);
    expect(result?.items).toEqual([1, 2]);
  });

  it('enforces minimum of one item when maxItems <= 0', () => {
    const key = makeCacheKey('oer', ['pk1']);
    writeCache(key, ['a', 'b', 'c'], 0);

    const result = readCache<string>(key, 60_000);
    expect(result?.items).toEqual(['a']);
  });

  it('clears cached value', () => {
    const key = makeCacheKey('oer', ['pk1']);
    writeCache(key, [{ id: 1 }], 10);
    clearCache(key);

    expect(localStorage.getItem(key)).toBeNull();
    expect(readCache(key, 60_000)).toBeNull();
  });
});
