/**
 * Default configuration for the OER-Shares plugin.
 *
 * Vocabulary URLs can be overridden at runtime via localStorage key
 * `blossom:oer-shares:config`.
 */

/** Default AMB relay for Edufeed. */
export const DEFAULT_AMB_RELAY = 'wss://amb-relay.edufeed.org';

/** Default SKOS vocabulary URLs.
 *  All vocabs are bundled locally under /vocabs/ for reliability.
 *  Users can override with remote URLs in Settings — if those fail,
 *  the SKOS loader falls back to the bundled version automatically.
 */
export const DEFAULT_VOCAB_URLS: Record<string, string> = {
  audience: '/vocabs/audience.json',
  educationalLevel: '/vocabs/educationalLevel.json',
  learningResourceType: '/vocabs/learningResourceType.json',
  about: '/vocabs/schulfaecher.json',
};

/** localStorage key for persisted config overrides. */
export const LS_CONFIG_KEY = 'blossom:oer-shares:config';

export interface OerSharesConfig {
  ambRelayUrl: string;
  vocabUrls: Record<string, string>;
}

/** Load persisted config from localStorage, falling back to defaults. */
export function loadConfig(): OerSharesConfig {
  const defaults: OerSharesConfig = {
    ambRelayUrl: DEFAULT_AMB_RELAY,
    vocabUrls: { ...DEFAULT_VOCAB_URLS },
  };

  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<OerSharesConfig>;
    return {
      ambRelayUrl: parsed.ambRelayUrl || defaults.ambRelayUrl,
      vocabUrls: { ...defaults.vocabUrls, ...(parsed.vocabUrls ?? {}) },
    };
  } catch {
    return defaults;
  }
}

/** Persist config overrides to localStorage. */
export function saveConfig(config: OerSharesConfig): void {
  try {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Silently fail — localStorage quota or private mode
  }
}
