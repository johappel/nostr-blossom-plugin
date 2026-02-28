/**
 * Bundled vocabulary data — inlined at build time.
 *
 * These are imported as JSON modules so Vite/Rollup embeds them directly
 * in the JS bundle. This ensures the vocabs work in any deployment context
 * (IIFE widget, ESM, etc.) without needing a separate `/vocabs/` directory.
 */

import audienceData from '../../public/vocabs/audience.json';
import educationalLevelData from '../../public/vocabs/educationalLevel.json';
import learningResourceTypeData from '../../public/vocabs/learningResourceType.json';
import schulfaecherData from '../../public/vocabs/schulfaecher.json';

/**
 * Map from vocab key to the raw JSON data (already parsed).
 * Used by the SKOS loader as an inline fallback when fetch fails.
 */
export const BUNDLED_VOCAB_DATA: Record<string, unknown> = {
  audience: audienceData,
  educationalLevel: educationalLevelData,
  learningResourceType: learningResourceTypeData,
  about: schulfaecherData,
};
