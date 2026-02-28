// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  loadPendingUploads,
  savePendingUpload,
  removePendingUpload,
  removePendingUploadByUrl,
  clearAllPendingUploads,
  extractRelatedFromTags,
  type PendingUpload,
} from './pending-uploads';

// ── localStorage CRUD ─────────────────────────────────────────────────────────

describe('loadPendingUploads', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty array when nothing stored', () => {
    expect(loadPendingUploads()).toEqual([]);
  });

  it('returns parsed pending uploads', () => {
    const items: PendingUpload[] = [
      {
        id: 'test-1',
        url: 'https://blossom.example/abc123',
        sha256: 'abc123',
        mime: 'image/webp',
        fileName: 'photo.webp',
        uploadTags: [['url', 'https://blossom.example/abc123'], ['x', 'abc123']],
        servers: ['https://blossom.example'],
        relatedHashes: [],
        relatedUrls: [],
        createdAt: 1700000000000,
      },
    ];
    localStorage.setItem('blossom-pending:default', JSON.stringify(items));
    expect(loadPendingUploads()).toEqual(items);
  });

  it('returns empty array on invalid JSON', () => {
    localStorage.setItem('blossom-pending:default', '{broken');
    expect(loadPendingUploads()).toEqual([]);
  });

  it('returns empty array when stored value is not an array', () => {
    localStorage.setItem('blossom-pending:default', JSON.stringify({ not: 'an-array' }));
    expect(loadPendingUploads()).toEqual([]);
  });

  it('uses appId for scoping', () => {
    const a: PendingUpload[] = [{
      id: 'a1', url: 'https://a.example/1', mime: 'image/png', fileName: 'a.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 1,
    }];
    const b: PendingUpload[] = [{
      id: 'b1', url: 'https://b.example/1', mime: 'image/png', fileName: 'b.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 2,
    }];
    localStorage.setItem('blossom-pending:app-a', JSON.stringify(a));
    localStorage.setItem('blossom-pending:app-b', JSON.stringify(b));
    expect(loadPendingUploads('app-a')).toEqual(a);
    expect(loadPendingUploads('app-b')).toEqual(b);
  });
});

describe('savePendingUpload', () => {
  beforeEach(() => localStorage.clear());

  it('saves a pending upload and returns it with an id', () => {
    const result = savePendingUpload('default', {
      url: 'https://blossom.example/abc',
      sha256: 'abc',
      mime: 'image/webp',
      fileName: 'test.webp',
      uploadTags: [['url', 'https://blossom.example/abc']],
      servers: ['https://blossom.example'],
      relatedHashes: [],
      relatedUrls: [],
      createdAt: Date.now(),
    });

    expect(result.id).toBeTruthy();
    expect(result.url).toBe('https://blossom.example/abc');

    const stored = loadPendingUploads('default');
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(result.id);
  });

  it('prepends new entries (newest first)', () => {
    savePendingUpload('default', {
      url: 'https://blossom.example/first',
      mime: 'image/png', fileName: 'first.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [],
      createdAt: 1,
    });
    savePendingUpload('default', {
      url: 'https://blossom.example/second',
      mime: 'image/png', fileName: 'second.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [],
      createdAt: 2,
    });

    const stored = loadPendingUploads('default');
    expect(stored).toHaveLength(2);
    expect(stored[0].url).toBe('https://blossom.example/second');
    expect(stored[1].url).toBe('https://blossom.example/first');
  });
});

describe('removePendingUpload', () => {
  beforeEach(() => localStorage.clear());

  it('removes the entry with the given id', () => {
    const p1 = savePendingUpload('default', {
      url: 'https://blossom.example/1', mime: 'image/png', fileName: '1.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 1,
    });
    const p2 = savePendingUpload('default', {
      url: 'https://blossom.example/2', mime: 'image/png', fileName: '2.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 2,
    });

    removePendingUpload('default', p1.id);

    const stored = loadPendingUploads('default');
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(p2.id);
  });

  it('removes localStorage key when last entry is removed', () => {
    const p = savePendingUpload('default', {
      url: 'https://blossom.example/only', mime: 'image/png', fileName: 'only.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 1,
    });

    removePendingUpload('default', p.id);
    expect(localStorage.getItem('blossom-pending:default')).toBeNull();
  });

  it('does nothing when id does not exist', () => {
    savePendingUpload('default', {
      url: 'https://blossom.example/1', mime: 'image/png', fileName: '1.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 1,
    });

    removePendingUpload('default', 'nonexistent-id');
    expect(loadPendingUploads('default')).toHaveLength(1);
  });
});

describe('removePendingUploadByUrl', () => {
  beforeEach(() => localStorage.clear());

  it('removes the entry with the given URL', () => {
    savePendingUpload('default', {
      url: 'https://blossom.example/target', mime: 'image/png', fileName: 't.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 1,
    });
    savePendingUpload('default', {
      url: 'https://blossom.example/keep', mime: 'image/png', fileName: 'k.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 2,
    });

    removePendingUploadByUrl('default', 'https://blossom.example/target');

    const stored = loadPendingUploads('default');
    expect(stored).toHaveLength(1);
    expect(stored[0].url).toBe('https://blossom.example/keep');
  });
});

describe('clearAllPendingUploads', () => {
  beforeEach(() => localStorage.clear());

  it('removes all pending uploads for the appId', () => {
    savePendingUpload('myapp', {
      url: 'https://blossom.example/1', mime: 'image/png', fileName: '1.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 1,
    });
    savePendingUpload('myapp', {
      url: 'https://blossom.example/2', mime: 'image/png', fileName: '2.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 2,
    });

    clearAllPendingUploads('myapp');
    expect(localStorage.getItem('blossom-pending:myapp')).toBeNull();
    expect(loadPendingUploads('myapp')).toEqual([]);
  });

  it('does not affect other appIds', () => {
    savePendingUpload('app-a', {
      url: 'https://a.example/1', mime: 'image/png', fileName: 'a.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 1,
    });
    savePendingUpload('app-b', {
      url: 'https://b.example/1', mime: 'image/png', fileName: 'b.png',
      uploadTags: [], servers: [], relatedHashes: [], relatedUrls: [], createdAt: 2,
    });

    clearAllPendingUploads('app-a');
    expect(loadPendingUploads('app-a')).toEqual([]);
    expect(loadPendingUploads('app-b')).toHaveLength(1);
  });
});

// ── extractRelatedFromTags ────────────────────────────────────────────────────

describe('extractRelatedFromTags', () => {
  it('extracts thumb and image URLs and hashes', () => {
    const tags = [
      ['url', 'https://blossom.example/main'],
      ['m', 'image/webp'],
      ['x', 'aabbccdd'],
      ['thumb', 'https://blossom.example/thumb123', 'a'.repeat(64)],
      ['image', 'https://blossom.example/preview456', 'b'.repeat(64)],
    ];

    const result = extractRelatedFromTags(tags);
    expect(result.relatedUrls).toEqual([
      'https://blossom.example/thumb123',
      'https://blossom.example/preview456',
    ]);
    expect(result.relatedHashes).toEqual([
      'a'.repeat(64),
      'b'.repeat(64),
    ]);
  });

  it('handles tags without hashes', () => {
    const tags = [
      ['thumb', 'https://blossom.example/thumb-no-hash'],
      ['image', 'https://blossom.example/preview-no-hash'],
    ];

    const result = extractRelatedFromTags(tags);
    expect(result.relatedUrls).toEqual([
      'https://blossom.example/thumb-no-hash',
      'https://blossom.example/preview-no-hash',
    ]);
    expect(result.relatedHashes).toEqual([]);
  });

  it('ignores non-thumb/image tags', () => {
    const tags = [
      ['url', 'https://blossom.example/main'],
      ['m', 'image/webp'],
      ['x', 'a'.repeat(64)],
      ['size', '12345'],
    ];

    const result = extractRelatedFromTags(tags);
    expect(result.relatedUrls).toEqual([]);
    expect(result.relatedHashes).toEqual([]);
  });

  it('returns empty arrays for empty tags', () => {
    const result = extractRelatedFromTags([]);
    expect(result.relatedUrls).toEqual([]);
    expect(result.relatedHashes).toEqual([]);
  });

  it('rejects invalid SHA-256 hashes (not 64 hex chars)', () => {
    const tags = [
      ['thumb', 'https://blossom.example/thumb', 'tooshort'],
      ['image', 'https://blossom.example/preview', 'not-hex-at-all!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'],
    ];

    const result = extractRelatedFromTags(tags);
    expect(result.relatedHashes).toEqual([]);
    expect(result.relatedUrls).toHaveLength(2);
  });
});
