import { describe, it, expect } from 'vitest';
import { parseMembershipEvent } from './nostr/memberships';
import { parseCommunityEvent } from './nostr/community';
import { parseShareEvent } from './nostr/community-media';

// ── kind:30382 membership parsing ────────────────────────────────────────────

describe('parseMembershipEvent', () => {
  it('parses a valid follow membership', () => {
    const result = parseMembershipEvent({
      tags: [
        ['d', 'abc123communityPubkey'],
        ['n', 'follow'],
        ['r', 'wss://relay.example.com'],
      ],
    });
    expect(result).toEqual({
      communityPubkey: 'abc123communityPubkey',
      relayHint: 'wss://relay.example.com',
    });
  });

  it('parses a member relationship', () => {
    const result = parseMembershipEvent({
      tags: [
        ['d', 'someCommunityPk'],
        ['relationship', 'member'],
      ],
    });
    expect(result).toEqual({
      communityPubkey: 'someCommunityPk',
      relayHint: undefined,
    });
  });

  it('returns null when d tag is missing', () => {
    const result = parseMembershipEvent({
      tags: [['n', 'follow']],
    });
    expect(result).toBeNull();
  });

  it('returns null when relationship is not follow/member', () => {
    const result = parseMembershipEvent({
      tags: [
        ['d', 'abc123'],
        ['n', 'mute'],
      ],
    });
    expect(result).toBeNull();
  });

  it('returns null when no relationship tag exists', () => {
    const result = parseMembershipEvent({
      tags: [['d', 'abc123']],
    });
    expect(result).toBeNull();
  });
});

// ── kind:10222 community parsing ─────────────────────────────────────────────

describe('parseCommunityEvent', () => {
  it('parses a community event with relays, blossom, and sections', () => {
    const result = parseCommunityEvent({
      pubkey: 'commPubkey1',
      tags: [
        ['r', 'wss://relay1.example.com'],
        ['r', 'wss://relay2.example.com'],
        ['blossom', 'https://blossom.example.com'],
        ['content', 'Chat'],
        ['k', '9'],
        ['content', 'Medien'],
        ['k', '1063'],
        ['k', '1'],
      ],
    });

    expect(result.pubkey).toBe('commPubkey1');
    expect(result.relays).toEqual([
      'wss://relay1.example.com',
      'wss://relay2.example.com',
    ]);
    expect(result.blossomUrls).toEqual(['https://blossom.example.com']);
    expect(result.contentSections).toHaveLength(2);
    expect(result.contentSections[0]).toEqual({
      name: 'Chat',
      allowedKinds: [9],
    });
    expect(result.contentSections[1]).toEqual({
      name: 'Medien',
      allowedKinds: [1063, 1],
    });
  });

  it('handles empty tags', () => {
    const result = parseCommunityEvent({
      pubkey: 'pk',
      tags: [],
    });
    expect(result.relays).toEqual([]);
    expect(result.blossomUrls).toEqual([]);
    expect(result.contentSections).toEqual([]);
  });

  it('ignores k tags before first content section', () => {
    const result = parseCommunityEvent({
      pubkey: 'pk',
      tags: [
        ['k', '9'],  // orphan — no section yet
        ['content', 'Beiträge'],
        ['k', '1'],
      ],
    });
    expect(result.contentSections).toHaveLength(1);
    expect(result.contentSections[0].allowedKinds).toEqual([1]);
  });
});

// ── kind:30222 share event parsing ───────────────────────────────────────────

describe('parseShareEvent', () => {
  it('parses a valid share event', () => {
    const result = parseShareEvent({
      id: 'shareEventId1',
      pubkey: 'sharerPk',
      created_at: 1700000000,
      tags: [
        ['d', 'randomId1'],
        ['e', 'originalNip94EventId'],
        ['k', '1063'],
        ['p', 'community1Pk'],
        ['r', 'wss://comm-relay.example.com'],
      ],
    });

    expect(result).toEqual({
      shareEventId: 'shareEventId1',
      originalEventId: 'originalNip94EventId',
      originalKind: 1063,
      sharedBy: 'sharerPk',
      sharedAt: 1700000000,
      targetCommunities: ['community1Pk'],
    });
  });

  it('parses multi-community share', () => {
    const result = parseShareEvent({
      id: 'id2',
      pubkey: 'pk2',
      created_at: 1700000001,
      tags: [
        ['d', 'x'],
        ['e', 'evId'],
        ['k', '1063'],
        ['p', 'comm1'],
        ['r', 'wss://r1.com'],
        ['p', 'comm2'],
        ['r', 'wss://r2.com'],
      ],
    });

    expect(result?.targetCommunities).toEqual(['comm1', 'comm2']);
  });

  it('defaults to kind 1063 when k tag is missing', () => {
    const result = parseShareEvent({
      id: 'id3',
      pubkey: 'pk3',
      created_at: 1700000002,
      tags: [
        ['d', 'y'],
        ['e', 'evId2'],
        ['p', 'comm1'],
      ],
    });

    expect(result?.originalKind).toBe(1063);
  });

  it('returns null when e tag is missing', () => {
    const result = parseShareEvent({
      id: 'id4',
      pubkey: 'pk4',
      created_at: 1700000003,
      tags: [
        ['d', 'z'],
        ['p', 'comm1'],
      ],
    });
    expect(result).toBeNull();
  });

  it('returns null when no p (community) tags exist', () => {
    const result = parseShareEvent({
      id: 'id5',
      pubkey: 'pk5',
      created_at: 1700000004,
      tags: [
        ['d', 'w'],
        ['e', 'evRef'],
      ],
    });
    expect(result).toBeNull();
  });
});
