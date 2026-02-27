/**
 * Formats an InsertResult into a string based on the chosen insert mode.
 *
 * Modes:
 *  - `url`       — Plain URL
 *  - `markdown`  — `![alt](url)\nauthor · [license](licenseUrl)`
 *  - `html`      — `<figure><img …><figcaption>…</figcaption></figure>`
 *  - `nostr-tag` — NIP-94 imeta inline tag
 *  - `json`      — JSON metadata object
 */

import type { InsertResult } from '../widget/types';
import type { InsertMode } from '../widget/types';

/** Human-readable labels for each insert mode (German) */
export const INSERT_MODE_LABELS: Record<InsertMode, string> = {
  url: 'URL',
  markdown: 'Markdown',
  html: 'HTML',
  'nostr-tag': 'Nostr imeta',
  json: 'JSON',
};

/**
 * Format an InsertResult into the requested string representation.
 */
export function formatInsertResult(result: InsertResult, mode: InsertMode): string {
  switch (mode) {
    case 'url':
      return result.url;

    case 'markdown':
      return formatMarkdown(result);

    case 'html':
      return formatHtml(result);

    case 'nostr-tag':
      return formatNostrTag(result);

    case 'json':
      return formatJson(result);

    default:
      return result.url;
  }
}

// ── Markdown ──────────────────────────────────────────────────────────────────

function formatMarkdown(r: InsertResult): string {
  const alt = r.alt || r.description || '';
  const isImage = r.mimeType?.startsWith('image/');
  let md = isImage ? `![${alt}](${r.url})` : `[${alt || r.url}](${r.url})`;

  const credits: string[] = [];
  if (r.author) credits.push(r.author);
  if (r.license && r.licenseLabel) {
    credits.push(`[${r.licenseLabel}](${r.license})`);
  } else if (r.licenseLabel) {
    credits.push(r.licenseLabel);
  } else if (r.license) {
    credits.push(`[Lizenz](${r.license})`);
  }

  if (credits.length) {
    md += '\n' + credits.join(' · ');
  }

  return md;
}

// ── HTML ──────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatHtml(r: InsertResult): string {
  const alt = esc(r.alt || r.description || '');
  const isImage = r.mimeType?.startsWith('image/');

  const credits: string[] = [];
  if (r.author) credits.push(esc(r.author));
  if (r.license && r.licenseLabel) {
    credits.push(`<a href="${esc(r.license)}">${esc(r.licenseLabel)}</a>`);
  } else if (r.licenseLabel) {
    credits.push(esc(r.licenseLabel));
  }

  const caption = credits.length ? `\n  <figcaption>${credits.join(' · ')}</figcaption>` : '';

  if (isImage) {
    return `<figure>\n  <img src="${esc(r.url)}" alt="${alt}" />${caption}\n</figure>`;
  }

  return `<a href="${esc(r.url)}">${alt || esc(r.url)}</a>`;
}

// ── Nostr imeta tag ───────────────────────────────────────────────────────────

function formatNostrTag(r: InsertResult): string {
  const parts = [`url ${r.url}`];
  if (r.mimeType) parts.push(`m ${r.mimeType}`);
  if (r.sha256) parts.push(`x ${r.sha256}`);
  if (r.size) parts.push(`size ${r.size}`);
  if (r.alt || r.description) parts.push(`alt ${r.alt || r.description}`);
  if (r.thumbnailUrl) parts.push(`thumb ${r.thumbnailUrl}`);
  return `["imeta", ${parts.map((p) => `"${p}"`).join(', ')}]`;
}

// ── JSON ──────────────────────────────────────────────────────────────────────

function formatJson(r: InsertResult): string {
  const obj: Record<string, unknown> = { url: r.url };
  if (r.mimeType) obj.mimeType = r.mimeType;
  if (r.sha256) obj.sha256 = r.sha256;
  if (r.size) obj.size = r.size;
  if (r.description) obj.description = r.description;
  if (r.alt) obj.alt = r.alt;
  if (r.author) obj.author = r.author;
  if (r.license) obj.license = r.license;
  if (r.licenseLabel) obj.licenseLabel = r.licenseLabel;
  if (r.genre) obj.genre = r.genre;
  if (r.keywords?.length) obj.keywords = r.keywords;
  if (r.thumbnailUrl) obj.thumbnailUrl = r.thumbnailUrl;
  if (r.previewUrl) obj.previewUrl = r.previewUrl;
  return JSON.stringify(obj, null, 2);
}
