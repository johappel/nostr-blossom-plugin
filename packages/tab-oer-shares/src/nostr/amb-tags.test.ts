/**
 * Tests for AMB tag builder and NIP-94 → AMB mapping.
 */
import { describe, it, expect } from 'vitest';
import { mapNip94ToAmb, buildAmbEventTags } from './amb-tags';
import type { AmbFormData } from './types';
import type { Nip94FileEvent } from '@blossom/plugin/plugin';

// ── Helpers ──

/** Find the first tag with the given key. */
function findTag(tags: string[][], key: string): string[] | undefined {
  return tags.find((t) => t[0] === key);
}

/** Find all tags with the given key. */
function findTags(tags: string[][], key: string): string[][] {
  return tags.filter((t) => t[0] === key);
}

// ── mapNip94ToAmb ──

describe('mapNip94ToAmb', () => {
  const sampleNip94: Nip94FileEvent = {
    eventId: 'evt123',
    createdAt: 1700000000,
    content: 'A sample file description',
    url: 'https://blossom.example.com/abc123.jpg',
    sha256: 'abc123def456',
    mime: 'image/jpeg',
    tags: [
      ['url', 'https://blossom.example.com/abc123.jpg'],
      ['m', 'image/jpeg'],
      ['x', 'abc123def456'],
      ['alt', 'Pythagorean theorem diagram'],
      ['summary', 'Ein Diagramm zum Satz des Pythagoras'],
      ['author', 'Max Mustermann'],
      ['license', 'CC-BY-4.0', 'CC BY 4.0'],
      ['t', 'Pythagoras'],
      ['t', 'Geometrie'],
      ['t', 'Mathematik'],
      ['size', '123456'],
      ['thumb', 'https://blossom.example.com/abc123_thumb.jpg'],
    ],
    metadata: {
      altAttribution: 'Pythagorean theorem diagram',
      description: 'Ein Diagramm zum Satz des Pythagoras',
      author: 'Max Mustermann',
      license: 'CC-BY-4.0',
      keywords: ['Pythagoras', 'Geometrie', 'Mathematik'],
    },
    thumbUrl: 'https://blossom.example.com/abc123_thumb.jpg',
  };

  it('should map altAttribution → name', () => {
    const result = mapNip94ToAmb(sampleNip94);
    expect(result.name).toBe('Pythagorean theorem diagram');
  });

  it('should map description → description', () => {
    const result = mapNip94ToAmb(sampleNip94);
    expect(result.description).toBe('Ein Diagramm zum Satz des Pythagoras');
  });

  it('should map author → creatorName', () => {
    const result = mapNip94ToAmb(sampleNip94);
    expect(result.creatorName).toBe('Max Mustermann');
  });

  it('should normalize license SPDX code to URL', () => {
    const result = mapNip94ToAmb(sampleNip94);
    expect(result.licenseUrl).toBe(
      'https://creativecommons.org/licenses/by/4.0/',
    );
  });

  it('should extract t tags → keywords', () => {
    const result = mapNip94ToAmb(sampleNip94);
    expect(result.keywords).toEqual(['Pythagoras', 'Geometrie', 'Mathematik']);
  });

  it('should map url, mime, sha256, size', () => {
    const result = mapNip94ToAmb(sampleNip94);
    expect(result.encodingUrl).toBe('https://blossom.example.com/abc123.jpg');
    expect(result.encodingFormat).toBe('image/jpeg');
    expect(result.encodingSha256).toBe('abc123def456');
    expect(result.encodingSize).toBe('123456');
  });

  it('should map thumbUrl → imageUrl', () => {
    const result = mapNip94ToAmb(sampleNip94);
    expect(result.imageUrl).toBe(
      'https://blossom.example.com/abc123_thumb.jpg',
    );
  });

  it('should default to de language and isAccessibleForFree', () => {
    const result = mapNip94ToAmb(sampleNip94);
    expect(result.inLanguage).toBe('de');
    expect(result.isAccessibleForFree).toBe(true);
  });

  it('should initialize empty SKOS selections', () => {
    const result = mapNip94ToAmb(sampleNip94);
    expect(result.audience).toEqual([]);
    expect(result.educationalLevel).toEqual([]);
    expect(result.learningResourceType).toEqual([]);
    expect(result.about).toEqual([]);
  });
});

// ── buildAmbEventTags ──

describe('buildAmbEventTags', () => {
  const sampleForm: AmbFormData = {
    name: 'Pythagorean Theorem Video',
    description: 'An introductory video explaining the Pythagorean theorem',
    keywords: ['Pythagoras', 'Geometrie', 'Mathematik'],
    creatorPubkey: '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    audience: [
      { id: 'http://purl.org/dcx/lrmi-vocabs/educationalAudienceRole/student', prefLabel: 'Lernende' },
    ],
    educationalLevel: [
      { id: 'https://w3id.org/kim/educationalLevel/level_2', prefLabel: 'Sekundarbereich I' },
    ],
    learningResourceType: [
      { id: 'http://w3id.org/openeduhub/vocabs/new_lrt/7a6e9608-2554-4981-95dc-47ab9ba924de', prefLabel: 'Video' },
    ],
    about: [
      { id: 'http://w3id.org/kim/schulfaecher/s1017', prefLabel: 'Mathematik' },
      { id: 'http://w3id.org/kim/schulfaecher/s1005', prefLabel: 'Deutsch' },
    ],
    inLanguage: 'de',
    isAccessibleForFree: true,
    encodingUrl: 'https://blossom.example.com/video.mp4',
    encodingFormat: 'video/mp4',
    encodingSha256: 'abc123',
    encodingSize: '999999',
    imageUrl: 'https://blossom.example.com/thumb.jpg',
  };

  it('should have d, type, name, description tags', () => {
    const tags = buildAmbEventTags(sampleForm);
    expect(findTag(tags, 'd')?.[1]).toBe('https://blossom.example.com/video.mp4');
    expect(findTag(tags, 'type')?.[1]).toBe('LearningResource');
    expect(findTag(tags, 'name')?.[1]).toBe('Pythagorean Theorem Video');
    expect(findTag(tags, 'description')?.[1]).toContain('introductory video');
  });

  it('should emit t tags for keywords', () => {
    const tags = buildAmbEventTags(sampleForm);
    const tTags = findTags(tags, 't');
    expect(tTags).toHaveLength(3);
    expect(tTags.map((t) => t[1])).toEqual(['Pythagoras', 'Geometrie', 'Mathematik']);
  });

  it('should emit p tag for Nostr-native creator', () => {
    const tags = buildAmbEventTags(sampleForm, 'wss://relay.example.com');
    const pTag = findTag(tags, 'p');
    expect(pTag).toBeDefined();
    expect(pTag?.[1]).toBe('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
    expect(pTag?.[2]).toBe('wss://relay.example.com');
    expect(pTag?.[3]).toBe('creator');
  });

  it('should emit flattened creator tags when no pubkey', () => {
    const form: AmbFormData = { ...sampleForm, creatorPubkey: undefined, creatorName: 'Prof. Doe' };
    const tags = buildAmbEventTags(form);
    expect(findTag(tags, 'creator:name')?.[1]).toBe('Prof. Doe');
    expect(findTag(tags, 'creator:type')?.[1]).toBe('Person');
    expect(findTag(tags, 'p')).toBeUndefined();
  });

  it('should emit concept tags with :id, :prefLabel:de, :type', () => {
    const tags = buildAmbEventTags(sampleForm);

    // Audience
    const audienceIds = findTags(tags, 'audience:id');
    expect(audienceIds).toHaveLength(1);
    expect(audienceIds[0][1]).toContain('student');

    const audienceLabels = findTags(tags, 'audience:prefLabel:de');
    expect(audienceLabels[0][1]).toBe('Lernende');

    const audienceTypes = findTags(tags, 'audience:type');
    expect(audienceTypes[0][1]).toBe('Concept');

    // About (multiple)
    const aboutIds = findTags(tags, 'about:id');
    expect(aboutIds).toHaveLength(2);
    expect(aboutIds[0][1]).toContain('s1017');
    expect(aboutIds[1][1]).toContain('s1005');
  });

  it('should emit license:id and isAccessibleForFree', () => {
    const tags = buildAmbEventTags(sampleForm);
    expect(findTag(tags, 'license:id')?.[1]).toBe(
      'https://creativecommons.org/licenses/by/4.0/',
    );
    expect(findTag(tags, 'isAccessibleForFree')?.[1]).toBe('true');
  });

  it('should emit encoding tags', () => {
    const tags = buildAmbEventTags(sampleForm);
    expect(findTag(tags, 'encoding:type')?.[1]).toBe('MediaObject');
    expect(findTag(tags, 'encoding:contentUrl')?.[1]).toBe(
      'https://blossom.example.com/video.mp4',
    );
    expect(findTag(tags, 'encoding:encodingFormat')?.[1]).toBe('video/mp4');
    expect(findTag(tags, 'encoding:sha256')?.[1]).toBe('abc123');
    expect(findTag(tags, 'encoding:contentSize')?.[1]).toBe('999999');
  });

  it('should emit image tag from imageUrl', () => {
    const tags = buildAmbEventTags(sampleForm);
    expect(findTag(tags, 'image')?.[1]).toBe(
      'https://blossom.example.com/thumb.jpg',
    );
  });

  it('should emit inLanguage and datePublished', () => {
    const tags = buildAmbEventTags(sampleForm);
    expect(findTag(tags, 'inLanguage')?.[1]).toBe('de');
    expect(findTag(tags, 'datePublished')?.[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
