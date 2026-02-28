/**
 * Tests for SKOS vocabulary loader.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSkosVocabulary, clearSkosCache } from './skos';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock the bundled-vocabs module so we can control inline fallback data
vi.mock('./bundled-vocabs', () => ({
  BUNDLED_VOCAB_DATA: {
    audience: {
      hasTopConcept: [
        { id: 'bundled1', prefLabel: { de: 'Bundled Concept' } },
      ],
    },
  } as Record<string, unknown>,
}));

beforeEach(() => {
  clearSkosCache();
  mockFetch.mockReset();
});

const SAMPLE_VOCAB = {
  id: 'https://w3id.org/kim/educationalLevel/',
  type: 'ConceptScheme',
  title: { de: 'Bildungsstufe' },
  hasTopConcept: [
    {
      id: 'https://w3id.org/kim/educationalLevel/level_0',
      prefLabel: { de: 'Elementarbereich', en: 'Early childhood education' },
    },
    {
      id: 'https://w3id.org/kim/educationalLevel/level_1',
      prefLabel: { de: 'Primarbereich', en: 'Primary education' },
    },
    {
      id: 'https://w3id.org/kim/educationalLevel/level_A',
      prefLabel: { de: 'Hochschule', en: 'University' },
      narrower: [
        {
          id: 'https://w3id.org/kim/educationalLevel/level_6',
          prefLabel: { de: 'Bachelor oder äquivalent' },
        },
        {
          id: 'https://w3id.org/kim/educationalLevel/level_7',
          prefLabel: { de: 'Master oder äquivalent' },
        },
      ],
    },
  ],
};

describe('fetchSkosVocabulary', () => {
  it('should parse top concepts with de labels', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(SAMPLE_VOCAB),
    });

    const concepts = await fetchSkosVocabulary('https://example.com/test.json');
    expect(concepts).toHaveLength(3);
    expect(concepts.find((c) => c.id.endsWith('level_0'))?.prefLabel).toBe(
      'Elementarbereich',
    );
    expect(concepts.find((c) => c.id.endsWith('level_1'))?.prefLabel).toBe(
      'Primarbereich',
    );
  });

  it('should parse hierarchical concepts (narrower → children)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(SAMPLE_VOCAB),
    });

    const concepts = await fetchSkosVocabulary('https://example.com/test.json');
    const hochschule = concepts.find((c) => c.id.endsWith('level_A'));
    expect(hochschule).toBeDefined();
    expect(hochschule?.children).toHaveLength(2);
    expect(hochschule?.children?.[0]?.prefLabel).toBe('Bachelor oder äquivalent');
    expect(hochschule?.children?.[1]?.prefLabel).toBe('Master oder äquivalent');
  });

  it('should cache results and not re-fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(SAMPLE_VOCAB),
    });

    const url = 'https://example.com/cached.json';
    const first = await fetchSkosVocabulary(url);
    const second = await fetchSkosVocabulary(url);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('should throw on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      fetchSkosVocabulary('https://example.com/missing.json'),
    ).rejects.toThrow('SKOS fetch failed: 404');
  });

  it('should throw on missing hasTopConcept', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'empty', type: 'ConceptScheme' }),
    });

    await expect(
      fetchSkosVocabulary('https://example.com/empty.json'),
    ).rejects.toThrow('no hasTopConcept array');
  });

  it('should skip concepts without prefLabel', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          hasTopConcept: [
            { id: 'valid', prefLabel: { de: 'Gültig' } },
            { id: 'no-label' }, // no prefLabel → should be filtered
            { prefLabel: { de: 'No ID' } }, // no id → should be filtered
          ],
        }),
    });

    const concepts = await fetchSkosVocabulary('https://example.com/partial.json');
    expect(concepts).toHaveLength(1);
    expect(concepts[0].prefLabel).toBe('Gültig');
  });

  it('should sort concepts alphabetically by German label', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          hasTopConcept: [
            { id: 'z', prefLabel: { de: 'Zebra' } },
            { id: 'a', prefLabel: { de: 'Apfel' } },
            { id: 'm', prefLabel: { de: 'Maus' } },
          ],
        }),
    });

    const concepts = await fetchSkosVocabulary('https://example.com/sort.json');
    expect(concepts.map((c) => c.prefLabel)).toEqual(['Apfel', 'Maus', 'Zebra']);
  });

  it('should parse @graph-wrapped ConceptScheme', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          '@graph': [
            {
              id: 'scheme',
              type: 'ConceptScheme',
              hasTopConcept: [
                { id: 'c1', prefLabel: { de: 'Eins' } },
                { id: 'c2', prefLabel: { de: 'Zwei' } },
              ],
            },
          ],
        }),
    });

    const concepts = await fetchSkosVocabulary('https://example.com/graph.json');
    expect(concepts).toHaveLength(2);
    expect(concepts[0].prefLabel).toBe('Eins');
  });

  it('should parse flat @graph with Concept nodes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          '@graph': [
            { id: 'scheme', type: 'ConceptScheme' },
            { id: 'c1', type: 'Concept', prefLabel: { de: 'Alpha' } },
            { id: 'c2', type: 'Concept', prefLabel: { de: 'Beta' } },
          ],
        }),
    });

    const concepts = await fetchSkosVocabulary('https://example.com/flat-graph.json');
    expect(concepts).toHaveLength(2);
    expect(concepts.map((c) => c.prefLabel)).toEqual(['Alpha', 'Beta']);
  });

  it('should parse member-based SKOS export', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          member: [
            { id: 'm1', prefLabel: { de: 'Mitglied A' } },
            { id: 'm2', prefLabel: { de: 'Mitglied B' } },
          ],
        }),
    });

    const concepts = await fetchSkosVocabulary('https://example.com/member.json');
    expect(concepts).toHaveLength(2);
    expect(concepts[0].prefLabel).toBe('Mitglied A');
  });

  it('should fall back to bundled inline data when remote URL fails', async () => {
    // Remote URL fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const concepts = await fetchSkosVocabulary(
      'https://remote.example.com/broken.json',
      'audience', // vocabKey enables fallback to BUNDLED_VOCAB_DATA.audience
    );
    expect(concepts).toHaveLength(1);
    expect(concepts[0].prefLabel).toBe('Bundled Concept');
    // Only one fetch attempt — the fallback uses inline data, no second fetch
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw if both remote and inline fallback fail', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    // vocabKey 'educationalLevel' is not in our mocked BUNDLED_VOCAB_DATA,
    // so no inline fallback is available.
    await expect(
      fetchSkosVocabulary('https://broken.example.com/vocab.json', 'educationalLevel'),
    ).rejects.toThrow('SKOS fetch failed: 500');
  });

  it('should not attempt fallback when vocabKey is not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      fetchSkosVocabulary('https://broken.example.com/no-key.json'),
    ).rejects.toThrow('SKOS fetch failed: 404');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
