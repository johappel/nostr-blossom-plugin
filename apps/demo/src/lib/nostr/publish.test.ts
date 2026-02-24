import { describe, expect, it } from 'vitest';
import { buildImageMetadataTags, buildKind1FallbackTags } from './publish';

describe('publish metadata helpers', () => {
  const uploadTags = [
    ['url', 'https://blossom.example/image.png'],
    ['m', 'image/png'],
    ['x', 'sha256-hash'],
    ['size', '12345'],
    ['dim', '1200x800'],
  ];

  const metadata = {
    description: 'Sunset over the bay',
    altAttribution: 'Photo by Alice',
    author: 'Alice',
    license: 'CC-BY-4.0',
    keywords: ['sunset', 'bay'],
  };

  it('builds kind 1063 metadata tags with passthrough and custom fields', () => {
    const tags = buildImageMetadataTags(uploadTags, metadata);

    expect(tags).toContainEqual(['url', 'https://blossom.example/image.png']);
    expect(tags).toContainEqual(['m', 'image/png']);
    expect(tags).toContainEqual(['x', 'sha256-hash']);
    expect(tags).toContainEqual(['summary', 'Sunset over the bay']);
    expect(tags).toContainEqual(['alt', 'Photo by Alice']);
    expect(tags).toContainEqual(['author', 'Alice']);
    expect(tags).toContainEqual(['license', 'CC-BY-4.0']);
    expect(tags).toContainEqual(['t', 'sunset']);
    expect(tags).toContainEqual(['t', 'bay']);
  });

  it('builds kind 1 fallback tags with url + metadata fields', () => {
    const tags = buildKind1FallbackTags(uploadTags, metadata);

    expect(tags).toContainEqual(['url', 'https://blossom.example/image.png']);
    expect(tags).toContainEqual(['m', 'image/png']);
    expect(tags).toContainEqual(['summary', 'Sunset over the bay']);
    expect(tags).toContainEqual(['alt', 'Photo by Alice']);
    expect(tags).toContainEqual(['author', 'Alice']);
    expect(tags).toContainEqual(['license', 'CC-BY-4.0']);
    expect(tags).toContainEqual(['t', 'sunset']);
    expect(tags).toContainEqual(['t', 'bay']);
  });
});
