/**
 * License presets and helpers for Blossom file metadata.
 *
 * Provides well-known Creative Commons / Open Source license presets,
 * plus utilities for converting between preset IDs, canonical URLs and
 * serialized "uri|label" strings as used in NIP-94 `license` tags.
 */

export interface LicensePreset {
  /** Short ID used for UI selection (e.g. 'cc-by-4.0') */
  id: string;
  /** Canonical URL of the license */
  canonical: string;
  /** Human-readable display label (e.g. 'CC BY 4.0') */
  label: string;
  /** SPDX-style short label for the `license` tag (e.g. 'CC-BY-4.0') */
  licenseLabel: string;
}

export interface LicenseValue {
  /** Canonical URL or SPDX code */
  canonical: string;
  /** Short label (e.g. 'CC-BY-4.0') */
  label: string;
}

/** Sentinel value: no license selected */
export const NO_LICENSE_ID = 'none';
/** Sentinel value: custom / freely entered license */
export const CUSTOM_LICENSE_ID = 'custom';
/** ID of the CC0 1.0 preset (useful for AI-generated images) */
export const CC0_LICENSE_ID = 'cc0-1.0';

/** All built-in license presets in display order. */
export const LICENSE_PRESETS: LicensePreset[] = [
  {
    id: 'cc-by-4.0',
    canonical: 'https://creativecommons.org/licenses/by/4.0/',
    label: 'CC BY 4.0',
    licenseLabel: 'CC-BY-4.0',
  },
  {
    id: 'cc-by-sa-4.0',
    canonical: 'https://creativecommons.org/licenses/by-sa/4.0/',
    label: 'CC BY-SA 4.0',
    licenseLabel: 'CC-BY-SA-4.0',
  },
  {
    id: 'cc-by-nd-4.0',
    canonical: 'https://creativecommons.org/licenses/by-nd/4.0/',
    label: 'CC BY-ND 4.0',
    licenseLabel: 'CC-BY-ND-4.0',
  },
  {
    id: 'cc-by-nc-4.0',
    canonical: 'https://creativecommons.org/licenses/by-nc/4.0/',
    label: 'CC BY-NC 4.0',
    licenseLabel: 'CC-BY-NC-4.0',
  },
  {
    id: 'cc-by-nc-sa-4.0',
    canonical: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    label: 'CC BY-NC-SA 4.0',
    licenseLabel: 'CC-BY-NC-SA-4.0',
  },
  {
    id: 'cc-by-nc-nd-4.0',
    canonical: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
    label: 'CC BY-NC-ND 4.0',
    licenseLabel: 'CC-BY-NC-ND-4.0',
  },
  {
    id: 'cc0-1.0',
    canonical: 'https://creativecommons.org/publicdomain/zero/1.0/',
    label: 'CC0 1.0 (Public Domain)',
    licenseLabel: 'CC0-1.0',
  },
  {
    id: 'pdm-1.0',
    canonical: 'https://creativecommons.org/publicdomain/mark/1.0/',
    label: 'Public Domain Mark 1.0',
    licenseLabel: 'PDM-1.0',
  },
  {
    id: 'mit',
    canonical: 'https://opensource.org/licenses/MIT',
    label: 'MIT License',
    licenseLabel: 'MIT',
  },
];

/**
 * Parse a serialized "uri|label" license spec into its parts.
 * Also accepts bare URIs / SPDX codes without a label part.
 *
 * @example
 * parseLicenseSpec('https://creativecommons.org/licenses/by/4.0/|CC-BY-4.0')
 * // → { canonical: 'https://...', label: 'CC-BY-4.0' }
 *
 * parseLicenseSpec('https://creativecommons.org/licenses/by/4.0/')
 * // → { canonical: 'https://...', label: '' }
 *
 * parseLicenseSpec('')
 * // → { canonical: '', label: '' }
 */
export function parseLicenseSpec(value: string): LicenseValue {
  const normalized = value.trim();
  if (!normalized) {
    return { canonical: '', label: '' };
  }

  const pipeIndex = normalized.indexOf('|');
  if (pipeIndex < 0) {
    return { canonical: normalized, label: '' };
  }

  return {
    canonical: normalized.slice(0, pipeIndex).trim(),
    label: normalized.slice(pipeIndex + 1).trim(),
  };
}

/**
 * Serialize a canonical URL + label back to "uri|label" format.
 * Returns just the canonical URL if label is empty, or empty string if
 * canonical is empty.
 */
export function toLicenseSpec(canonical: string, label: string): string {
  if (!canonical) return '';
  if (!label) return canonical;
  return `${canonical}|${label}`;
}

/**
 * Resolve the license value for a given preset ID or custom spec string.
 *
 * @param choice   - Preset ID, `NO_LICENSE_ID`, or `CUSTOM_LICENSE_ID`
 * @param customSpec - "uri|label" string used when choice is CUSTOM_LICENSE_ID
 */
export function getLicenseFromChoice(choice: string, customSpec = ''): LicenseValue {
  if (choice === NO_LICENSE_ID) {
    return { canonical: '', label: '' };
  }

  if (choice === CUSTOM_LICENSE_ID) {
    return parseLicenseSpec(customSpec);
  }

  const preset = LICENSE_PRESETS.find((item) => item.id === choice);
  if (!preset) {
    return { canonical: '', label: '' };
  }

  return { canonical: preset.canonical, label: preset.licenseLabel };
}

export interface ResolvedLicenseChoice {
  /** Preset ID, NO_LICENSE_ID, or CUSTOM_LICENSE_ID */
  choice: string;
  /** Only set when choice === CUSTOM_LICENSE_ID */
  customSpec: string;
  canonical: string;
  label: string;
}

/**
 * Given existing license values (canonical + label), determine which preset
 * ID to select in a UI dropdown and what customSpec to populate.
 */
export function resolveLicenseChoice(
  canonical?: string,
  label?: string,
): ResolvedLicenseChoice {
  const c = canonical?.trim() ?? '';
  const l = label?.trim() ?? '';

  if (!c) {
    return { choice: NO_LICENSE_ID, customSpec: '', canonical: '', label: '' };
  }

  const preset = LICENSE_PRESETS.find((item) => item.canonical === c);
  if (preset) {
    return {
      choice: preset.id,
      customSpec: '',
      canonical: preset.canonical,
      label: l || preset.licenseLabel,
    };
  }

  return {
    choice: CUSTOM_LICENSE_ID,
    customSpec: toLicenseSpec(c, l),
    canonical: c,
    label: l,
  };
}

/**
 * Format a license value for display (e.g. in metadata views).
 * Returns '—' when no license is set.
 */
export function formatLicenseDisplay(canonical?: string, label?: string): string {
  const c = canonical?.trim() ?? '';
  const l = label?.trim() ?? '';
  if (!c) return '—';
  return l ? `${l} (${c})` : c;
}
