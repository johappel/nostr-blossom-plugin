/**
 * Default configuration for the OER-Shares plugin.
 *
 * Vocabulary URLs can be overridden at runtime via localStorage key
 * `blossom:oer-shares:config`.
 */

/** Default AMB relay for Edufeed. */
export const DEFAULT_AMB_RELAY = 'wss://relay-amb.edufeed.org';

/** Default SKOS vocabulary URLs (SkoHub JSON-LD endpoints). */
export const DEFAULT_VOCAB_URLS: Record<string, string> = {
  audience:
    'https://skohub.io/dini-ag-kim/lrmi-audience-role/heads/master/w3id.org/kim/lrmi-audience-role/index.json',
  educationalLevel:
    'https://skohub.io/dini-ag-kim/educationalLevel/heads/main/w3id.org/kim/educationalLevel/index.json',
  learningResourceType:
    'https://skohub.io/dini-ag-kim/hcrt/heads/master/w3id.org/kim/hcrt/index.json',
  about:
    'https://skohub.io/dini-ag-kim/schulfaecher/heads/main/w3id.org/kim/schulfaecher/index.json',
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
