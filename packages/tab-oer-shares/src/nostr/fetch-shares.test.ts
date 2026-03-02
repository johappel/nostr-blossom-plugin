/**
 * Tests for fetchUserAmbShares — parsing kind:30142 events.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the parsing logic by importing the module and mocking
// the Relay connection. Since fetchUserAmbShares uses nostr-tools/relay
// internally, we mock at that level.

// Mock nostr-tools/relay
vi.mock('nostr-tools/relay', () => ({
  Relay: {
    connect: vi.fn(),
  },
}));

import { fetchUserAmbShares } from './fetch-shares';
import { Relay } from 'nostr-tools/relay';

const mockRelay = Relay as unknown as {
  connect: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mockRelay.connect.mockReset();
});

const SAMPLE_30142_EVENT = {
  id: 'event123',
  pubkey: 'pubkey123',
  kind: 30142,
  created_at: 1700000000,
  content: 'An introductory video explaining the Pythagorean theorem',
  tags: [
    ['d', 'oersi.org/resources/example'],
    ['type', 'LearningResource'],
    ['name', 'Pythagorean Theorem Video'],
    ['description', 'An introductory video explaining the Pythagorean theorem'],
    ['about:id', 'http://w3id.org/kim/schulfaecher/s1017'],
    ['about:prefLabel:de', 'Mathematik'],
    ['about:type', 'Concept'],
    ['about:id', 'http://w3id.org/kim/schulfaecher/s1005'],
    ['about:prefLabel:de', 'Deutsch'],
    ['about:type', 'Concept'],
    ['learningResourceType:id', 'http://w3id.org/openeduhub/vocabs/new_lrt/video'],
    ['learningResourceType:prefLabel:de', 'Video'],
    ['learningResourceType:type', 'Concept'],
    ['audience:id', 'http://purl.org/dcx/lrmi-vocabs/educationalAudienceRole/student'],
    ['audience:prefLabel:de', 'Lernende'],
    ['audience:type', 'Concept'],
    ['educationalLevel:id', 'https://w3id.org/kim/educationalLevel/level_2'],
    ['educationalLevel:prefLabel:de', 'Sekundarbereich I'],
    ['t', 'Pythagoras'],
    ['t', 'Geometrie'],
    ['t', 'Mathematik'],
    ['keywords', '["Math", "Physics"]'],
    ['creator:name', 'John'],
    ['creator:name', 'Jane'],
    ['e', 'nip94-source-event-id'],
    ['inLanguage', 'de'],
    ['license:id', 'https://creativecommons.org/licenses/by/4.0/'],
    ['isAccessibleForFree', 'true'],
    ['encoding:contentUrl', 'https://blossom.example.com/video.mp4'],
    ['image', 'https://blossom.example.com/thumb.jpg'],
  ],
  sig: 'sig123',
};

function createMockRelay(events: Record<string, unknown>[]) {
  return {
    subscribe: vi.fn((_filters: unknown, handlers: Record<string, Function>) => {
      // Emit all events asynchronously
      setTimeout(() => {
        for (const evt of events) {
          handlers.onevent(evt);
        }
        handlers.oneose();
      }, 10);

      return { close: vi.fn() };
    }),
    close: vi.fn(),
  };
}

describe('fetchUserAmbShares', () => {
  it('should parse a valid kind:30142 event into AmbShareItem', async () => {
    const relay = createMockRelay([SAMPLE_30142_EVENT]);
    mockRelay.connect.mockResolvedValueOnce(relay);

    const shares = await fetchUserAmbShares('pubkey123', 'wss://test-relay.example.com');

    expect(shares).toHaveLength(1);
    const item = shares[0];

    expect(item.eventId).toBe('event123');
    expect(item.dTag).toBe('oersi.org/resources/example');
    expect(item.name).toBe('Pythagorean Theorem Video');
    expect(item.description).toContain('Pythagorean theorem');
    expect(item.keywords).toEqual(['Pythagoras', 'Geometrie', 'Mathematik', 'Math', 'Physics']);
    expect(item.creatorName).toBe('John, Jane');
    expect(item.nip94EventId).toBe('nip94-source-event-id');
  });

  it('should parse concept tags with prefLabels', async () => {
    const relay = createMockRelay([SAMPLE_30142_EVENT]);
    mockRelay.connect.mockResolvedValueOnce(relay);

    const shares = await fetchUserAmbShares('pubkey123', 'wss://test.com');
    const item = shares[0];

    // About — two concepts
    expect(item.about).toHaveLength(2);
    expect(item.about[0]).toEqual({
      id: 'http://w3id.org/kim/schulfaecher/s1017',
      prefLabel: 'Mathematik',
    });
    expect(item.about[1]).toEqual({
      id: 'http://w3id.org/kim/schulfaecher/s1005',
      prefLabel: 'Deutsch',
    });

    // LearningResourceType
    expect(item.learningResourceType).toHaveLength(1);
    expect(item.learningResourceType[0].prefLabel).toBe('Video');

    // Audience
    expect(item.audience).toHaveLength(1);
    expect(item.audience[0].prefLabel).toBe('Lernende');

    // EducationalLevel
    expect(item.educationalLevel).toHaveLength(1);
    expect(item.educationalLevel[0].prefLabel).toBe('Sekundarbereich I');
  });

  it('should parse license, language, access flag', async () => {
    const relay = createMockRelay([SAMPLE_30142_EVENT]);
    mockRelay.connect.mockResolvedValueOnce(relay);

    const shares = await fetchUserAmbShares('pubkey123', 'wss://test.com');
    const item = shares[0];

    expect(item.licenseId).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(item.inLanguage).toBe('de');
    expect(item.isAccessibleForFree).toBe(true);
  });

  it('should parse encoding and image URLs', async () => {
    const relay = createMockRelay([SAMPLE_30142_EVENT]);
    mockRelay.connect.mockResolvedValueOnce(relay);

    const shares = await fetchUserAmbShares('pubkey123', 'wss://test.com');
    const item = shares[0];

    expect(item.encodingUrl).toBe('https://blossom.example.com/video.mp4');
    expect(item.imageUrl).toBe('https://blossom.example.com/thumb.jpg');
  });

  it('should sort by newest first', async () => {
    const events = [
      { ...SAMPLE_30142_EVENT, id: 'old', created_at: 1600000000 },
      { ...SAMPLE_30142_EVENT, id: 'new', created_at: 1800000000 },
      { ...SAMPLE_30142_EVENT, id: 'mid', created_at: 1700000000 },
    ];
    const relay = createMockRelay(events);
    mockRelay.connect.mockResolvedValueOnce(relay);

    const shares = await fetchUserAmbShares('pubkey123', 'wss://test.com');
    expect(shares.map((s) => s.eventId)).toEqual(['new', 'mid', 'old']);
  });

  it('should handle empty response', async () => {
    const relay = createMockRelay([]);
    mockRelay.connect.mockResolvedValueOnce(relay);

    const shares = await fetchUserAmbShares('pubkey123', 'wss://test.com');
    expect(shares).toEqual([]);
  });

  it('should skip events without d tag', async () => {
    const badEvent = {
      ...SAMPLE_30142_EVENT,
      id: 'bad',
      tags: [['name', 'No D Tag']],
    };
    const relay = createMockRelay([badEvent, SAMPLE_30142_EVENT]);
    mockRelay.connect.mockResolvedValueOnce(relay);

    const shares = await fetchUserAmbShares('pubkey123', 'wss://test.com');
    expect(shares).toHaveLength(1);
    expect(shares[0].eventId).toBe('event123');
  });

  it('should parse creatorName from author tag fallback', async () => {
    const event = {
      ...SAMPLE_30142_EVENT,
      id: 'author-fallback',
      tags: SAMPLE_30142_EVENT.tags.filter((t) => t[0] !== 'creator:name').concat([
        ['author', 'Fallback Author'],
      ]),
    };

    const relay = createMockRelay([event]);
    mockRelay.connect.mockResolvedValueOnce(relay);

    const shares = await fetchUserAmbShares('pubkey123', 'wss://test.com');
    expect(shares[0].creatorName).toContain('Fallback Author');
  });

  it('should prefer 64-hex e tag value when multiple e tags exist', async () => {
    const event = {
      ...SAMPLE_30142_EVENT,
      id: 'multi-e',
      tags: SAMPLE_30142_EVENT.tags.concat([
        ['e', 'short-id'],
        ['e', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      ]),
    };

    const relay = createMockRelay([event]);
    mockRelay.connect.mockResolvedValueOnce(relay);

    const shares = await fetchUserAmbShares('pubkey123', 'wss://test.com');
    expect(shares[0].nip94EventId).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });
});
