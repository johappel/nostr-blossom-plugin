import { describe, expect, it } from 'vitest';
import { isValidBunkerUri } from './nip46';

describe('isValidBunkerUri', () => {
  it('accepts valid bunker URI', () => {
    expect(
      isValidBunkerUri('bunker://abcdef1234567890?relay=wss://relay.nsecbunker.com&secret=mysecret'),
    ).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidBunkerUri('')).toBe(false);
  });

  it('rejects non-bunker protocol', () => {
    expect(isValidBunkerUri('https://example.com')).toBe(false);
  });

  it('rejects bunker URI without relay param', () => {
    expect(isValidBunkerUri('bunker://abcdef1234567890')).toBe(false);
  });

  it('accepts bunker URI with relay only (no secret)', () => {
    expect(
      isValidBunkerUri('bunker://abcdef1234567890?relay=wss://relay.example.com'),
    ).toBe(true);
  });
});
