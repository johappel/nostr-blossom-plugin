/**
 * SKOS Vocabulary Loader
 *
 * Fetches and caches SKOS concept hierarchies from SkoHub JSON-LD endpoints.
 * Concepts are normalized to a simple `{ id, prefLabel, children? }` tree
 * with only the German (`de`) label extracted.
 */

import type { SkosConcept } from './types';

// ── In-memory cache (module closure) ─────────────────────────────────────────
const _cache = new Map<string, SkosConcept[]>();

/**
 * Parse a single raw SkoHub concept object into our `SkosConcept` type.
 * Handles `prefLabel` as either `{ de: "..." }` or a plain string.
 */
function parseConcept(raw: Record<string, unknown>): SkosConcept | null {
  const id = raw.id as string | undefined;
  if (!id) return null;

  let prefLabel = '';
  const rawLabel = raw.prefLabel;
  if (typeof rawLabel === 'string') {
    prefLabel = rawLabel;
  } else if (rawLabel && typeof rawLabel === 'object') {
    const labelObj = rawLabel as Record<string, string>;
    prefLabel = labelObj.de ?? labelObj.en ?? Object.values(labelObj)[0] ?? '';
  }
  if (!prefLabel) return null;

  // Recursively parse narrower (child) concepts if present
  let children: SkosConcept[] | undefined;
  const rawNarrower = raw.narrower;
  if (Array.isArray(rawNarrower) && rawNarrower.length > 0) {
    const parsed = rawNarrower
      .map((c: Record<string, unknown>) => parseConcept(c))
      .filter((c): c is SkosConcept => c !== null);
    if (parsed.length > 0) children = parsed;
  }

  return { id, prefLabel, children };
}

/**
 * Fetch and parse a SKOS vocabulary from a SkoHub JSON-LD URL.
 *
 * Returns a flat/hierarchical list of concepts. Results are cached
 * in-memory so subsequent calls for the same URL return instantly.
 *
 * @param url  SkoHub JSON-LD endpoint (e.g. `https://skohub.io/...index.json`)
 * @returns    Parsed concepts (top-level, with optional children)
 * @throws     On network or parse errors
 */
export async function fetchSkosVocabulary(url: string): Promise<SkosConcept[]> {
  const cached = _cache.get(url);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`SKOS fetch failed: ${res.status} ${res.statusText} (${url})`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  // SkoHub ConceptScheme has `hasTopConcept` as the concept list
  const rawConcepts = json.hasTopConcept as Record<string, unknown>[] | undefined;
  if (!Array.isArray(rawConcepts)) {
    throw new Error(`Unexpected SKOS response: no hasTopConcept array (${url})`);
  }

  const concepts = rawConcepts
    .map(parseConcept)
    .filter((c): c is SkosConcept => c !== null)
    .sort((a, b) => a.prefLabel.localeCompare(b.prefLabel, 'de'));

  _cache.set(url, concepts);
  return concepts;
}

/**
 * Clear the in-memory vocabulary cache (for testing or plugin destroy).
 */
export function clearSkosCache(): void {
  _cache.clear();
}

/**
 * Check whether a vocabulary URL is already cached.
 */
export function isVocabCached(url: string): boolean {
  return _cache.has(url);
}
