import { describe, expect, it } from 'vitest';
import { shortenPubkey } from './profile';

describe('shortenPubkey', () => {
  it('shortens a 64-char hex key', () => {
    const key = 'a'.repeat(60) + 'bcde';
    const result = shortenPubkey(key);
    expect(result).toBe('aaaaaaaa…bcde');
  });

  it('returns short pubkeys unchanged', () => {
    expect(shortenPubkey('abc')).toBe('abc');
  });

  it('handles empty string', () => {
    expect(shortenPubkey('')).toBe('');
  });
});
