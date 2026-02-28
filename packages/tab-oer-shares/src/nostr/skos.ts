/**
 * SKOS Vocabulary Loader
 *
 * Fetches and caches SKOS concept hierarchies from local or remote JSON-LD
 * endpoints. Concepts are normalized to `{ id, prefLabel, children? }` trees
 * with the German (`de`) label preferred.
 *
 * Fallback strategy:
 *  1. Try the configured URL (could be local or a user-provided remote URL)
 *  2. If that fails and a bundled local file exists → load the bundled version
 *  3. If both fail → throw
 */

import type { SkosConcept } from './types';
import { BUNDLED_VOCAB_DATA } from './bundled-vocabs';

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
 * Fetch and parse a SKOS vocabulary.
 *
 * Tries the given URL first. If it fails (network/CORS/404) and a bundled
 * fallback exists for the vocab key, the local copy is loaded instead.
 *
 * @param url      JSON-LD endpoint or local path
 * @param vocabKey Optional key ('audience'|'educationalLevel'|…) to enable
 *                 automatic fallback to the bundled version on failure.
 * @returns        Parsed concepts (top-level, with optional children)
 * @throws         Only if both primary URL and fallback fail
 */
export async function fetchSkosVocabulary(
  url: string,
  vocabKey?: string,
): Promise<SkosConcept[]> {
  const cached = _cache.get(url);
  if (cached) return cached;

  try {
    const concepts = await fetchAndParse(url);
    _cache.set(url, concepts);
    return concepts;
  } catch (primaryError) {
    // If bundled inline data exists for this vocab key, parse it directly
    // without any network request.
    const inlineData =
      vocabKey ? BUNDLED_VOCAB_DATA[vocabKey] : undefined;

    if (inlineData) {
      try {
        const concepts = parseVocabData(inlineData as Record<string, unknown>);
        _cache.set(url, concepts); // Cache under the original key
        console.warn(
          `[OER-Shares] Remote vocab failed (${url}), using bundled inline data.`,
        );
        return concepts;
      } catch {
        // Inline parse also failed — throw the original error
      }
    }

    throw primaryError;
  }
}

/**
 * Internal: parse already-loaded vocab JSON data into SkosConcept[]
 * Used for inline-bundled vocabularies (no fetch required).
 */
function parseVocabData(json: Record<string, unknown>): SkosConcept[] {
  const rawConcepts = extractTopConcepts(json);
  if (!rawConcepts || rawConcepts.length === 0) {
    throw new Error('Unexpected SKOS data: no hasTopConcept array (inline)');
  }
  return rawConcepts
    .map(parseConcept)
    .filter((c): c is SkosConcept => c !== null)
    .sort((a, b) => a.prefLabel.localeCompare(b.prefLabel, 'de'));
}

/**
 * Internal: fetch a URL and parse it into SkosConcept[]
 */
async function fetchAndParse(url: string): Promise<SkosConcept[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`SKOS fetch failed: ${res.status} ${res.statusText} (${url})`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  const rawConcepts = extractTopConcepts(json);
  if (!rawConcepts || rawConcepts.length === 0) {
    throw new Error(`Unexpected SKOS response: no hasTopConcept array (${url})`);
  }

  return rawConcepts
    .map(parseConcept)
    .filter((c): c is SkosConcept => c !== null)
    .sort((a, b) => a.prefLabel.localeCompare(b.prefLabel, 'de'));
}

/**
 * Extract the top-level concepts from various JSON-LD shapes.
 */
function extractTopConcepts(
  json: Record<string, unknown>,
): Record<string, unknown>[] | null {
  // Shape 1: Direct hasTopConcept at root
  if (Array.isArray(json.hasTopConcept)) {
    return json.hasTopConcept as Record<string, unknown>[];
  }

  // Shape 2 & 3: @graph wrapper
  const graph = json['@graph'];
  if (Array.isArray(graph)) {
    // Look for a ConceptScheme node with hasTopConcept inside the graph
    for (const node of graph) {
      const n = node as Record<string, unknown>;
      if (Array.isArray(n.hasTopConcept)) {
        return n.hasTopConcept as Record<string, unknown>[];
      }
    }
    // Fallback: treat all Concept-typed nodes in @graph as top concepts
    const concepts = (graph as Record<string, unknown>[]).filter(
      (n) => n.type === 'Concept' || n['@type'] === 'Concept',
    );
    if (concepts.length > 0) return concepts;
  }

  // Shape 4: `member` array (some SKOS exports)
  if (Array.isArray(json.member)) {
    return json.member as Record<string, unknown>[];
  }

  return null;
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
