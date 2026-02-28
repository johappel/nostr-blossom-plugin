#!/usr/bin/env node
/**
 * update-vocabs.mjs — Fetch SKOS vocabularies from upstream sources
 * and write minimal local copies into public/vocabs/.
 *
 * Usage:
 *   node scripts/update-vocabs.mjs          # update all
 *   node scripts/update-vocabs.mjs audience  # update only 'audience'
 *
 * Each vocab entry has:
 *   - key:      config key (audience, educationalLevel, …)
 *   - remote:   upstream URL (may be null if hand-maintained)
 *   - local:    output path relative to this script's package
 *   - minify:   strip altLabel/definition/@context to keep files small
 *
 * If a remote fetch fails the existing local file is kept untouched.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'public', 'vocabs');

// ── Upstream sources ─────────────────────────────────────────────────────────
// Set `remote` to null for vocabs that are hand-maintained (e.g. audience).
const VOCABS = [
  {
    key: 'audience',
    remote: null, // hand-maintained — no upstream available
    local: 'audience.json',
  },
  {
    key: 'educationalLevel',
    remote:
      'https://skohub.io/dini-ag-kim/educationalLevel/heads/main/w3id.org/kim/educationalLevel/index.json',
    local: 'educationalLevel.json',
  },
  {
    key: 'learningResourceType',
    remote:
      'https://vocabs.sodix.de/sodix/educational/learningresourcetype/learningresourcetype.json',
    local: 'learningResourceType.json',
  },
  {
    key: 'about',
    remote:
      'https://skohub.io/dini-ag-kim/schulfaecher/heads/main/w3id.org/kim/schulfaecher/index.json',
    local: 'schulfaecher.json',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip a concept down to { id, prefLabel, narrower? }.
 * Removes altLabel, definition, example, @context, etc.
 */
function minifyConcept(raw) {
  if (!raw || !raw.id || !raw.prefLabel) return null;

  const concept = {
    id: raw.id,
    prefLabel: raw.prefLabel,
  };

  if (Array.isArray(raw.narrower) && raw.narrower.length > 0) {
    const children = raw.narrower.map(minifyConcept).filter(Boolean);
    if (children.length > 0) concept.narrower = children;
  }

  return concept;
}

/**
 * Minify a full SKOS ConceptScheme response:
 * keep id, type, title, hasTopConcept (minified).
 */
function minifyVocab(json) {
  const out = {
    id: json.id,
    type: json.type || 'ConceptScheme',
  };
  if (json.title) out.title = json.title;

  const concepts = json.hasTopConcept;
  if (Array.isArray(concepts)) {
    out.hasTopConcept = concepts.map(minifyConcept).filter(Boolean);
  }

  return out;
}

async function fetchVocab(entry) {
  if (!entry.remote) {
    console.log(`  ⏭  ${entry.key}: hand-maintained, skipping fetch`);
    return;
  }

  console.log(`  ⬇  ${entry.key}: fetching ${entry.remote}`);

  const res = await fetch(entry.remote);
  if (!res.ok) {
    console.error(
      `  ✗  ${entry.key}: HTTP ${res.status} ${res.statusText} — keeping existing local file`,
    );
    return;
  }

  const json = await res.json();
  const minified = minifyVocab(json);

  if (
    !minified.hasTopConcept ||
    minified.hasTopConcept.length === 0
  ) {
    console.error(
      `  ✗  ${entry.key}: no concepts found in response — keeping existing local file`,
    );
    return;
  }

  const outPath = resolve(PUBLIC_DIR, entry.local);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(minified, null, 2) + '\n', 'utf-8');

  console.log(
    `  ✓  ${entry.key}: ${minified.hasTopConcept.length} concepts → ${entry.local}`,
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
const filterKey = process.argv[2]; // optional: only update a specific vocab

console.log('🔄 Updating bundled SKOS vocabularies…\n');

const targets = filterKey
  ? VOCABS.filter((v) => v.key === filterKey)
  : VOCABS;

if (targets.length === 0) {
  console.error(`Unknown vocab key: "${filterKey}"`);
  console.error(`Available: ${VOCABS.map((v) => v.key).join(', ')}`);
  process.exit(1);
}

for (const entry of targets) {
  await fetchVocab(entry);
}

console.log('\n✅ Done.');
