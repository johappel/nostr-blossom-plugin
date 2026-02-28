/**
 * Tests for SKOS vocabulary loader.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSkosVocabulary, clearSkosCache } from './skos';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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
});
