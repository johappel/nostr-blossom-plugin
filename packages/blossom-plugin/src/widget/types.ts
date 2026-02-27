/**
 * Configuration types for the Blossom Media Widget.
 *
 * The widget is a self-contained, embeddable media library (similar to the
 * WordPress media picker) that can be injected into any HTML page via a
 * `<script>` tag or ESM import.
 */

import type { BlossomSigner } from '../core/types';

// ─── Insert modes ─────────────────────────────────────────────────────────────

/**
 * How the selected / uploaded file URL is written back to the target element.
 *
 * - `url`       – Plain URL string (default). Sets `input.value` or inserts at
 *                 cursor in `textarea`.
 * - `markdown`  – `![alt](url)` for images, `[filename](url)` for other files.
 * - `html`      – `<img src="url" alt="alt">` for images, `<a href>` otherwise.
 * - `nostr-tag` – NIP-94 imeta tag string for use in Nostr clients.
 * - `json`      – Full metadata as JSON object.
 */
export type InsertMode = 'url' | 'markdown' | 'html' | 'nostr-tag' | 'json';

// ─── Result / callback payload ────────────────────────────────────────────────

/**
 * Payload passed to `onInsert` after the user clicks "Übernehmen".
 * Contains the full metadata so the host application can use what it needs.
 */
export interface InsertResult {
  /** Primary file URL */
  url: string;
  /** Thumbnail URL (200 px), if available */
  thumbnailUrl?: string;
  /** Preview image URL (600 px), if available */
  previewUrl?: string;
  /** MIME type, e.g. 'image/webp' */
  mimeType?: string;
  /** SHA-256 hash of the original file */
  sha256?: string;
  /** File size in bytes */
  size?: number;
  /** Long-form description */
  description?: string;
  /** Alt text / attribution */
  alt?: string;
  /** Author / creator */
  author?: string;
  /** Canonical license URL */
  license?: string;
  /** Short license label, e.g. 'CC-BY-4.0' */
  licenseLabel?: string;
  /** Genre / style hint */
  genre?: string;
  /** Keyword tags */
  keywords?: string[];
  /** All raw NIP-94 tags from the upload response */
  tags: string[][];
  /** Selected output format */
  insertMode?: InsertMode;
  /** Pre-formatted text based on insertMode */
  formattedText?: string;
}

// ─── Feature toggles ─────────────────────────────────────────────────────────

/**
 * Fine-grained feature flags. All default to `true` unless disabled.
 */
export interface BlossomMediaFeatures {
  /** Show the "Dateien hochladen" tab */
  upload?: boolean;
  /** Show the "Mediathek" gallery tab */
  gallery?: boolean;
  /** Show the AI description suggestion button in the metadata form */
  aiDescription?: boolean;
  /** Show the full metadata form (description, alt, author, license, …) */
  metadata?: boolean;
  /** Allow deleting files from gallery */
  deleteFiles?: boolean;
}

// ─── Custom tabs ─────────────────────────────────────────────────────────────

/**
 * Interface for adding custom tabs to the media widget.
 * Reserved for future use — custom tabs are not yet implemented.
 */
export interface CustomTab {
  /** Unique tab ID */
  id: string;
  /** Tab label shown in the tab bar */
  label: string;
  /**
   * Called when the tab becomes active. Receives the container element
   * and must render custom content into it.
   * Returns an optional cleanup function called when the tab is hidden.
   */
  render: (container: HTMLElement) => (() => void) | void;
}

// ─── Main configuration ───────────────────────────────────────────────────────

/**
 * Configuration object passed to `BlossomMedia.init()`.
 */
export interface BlossomMediaConfig {
  /**
   * CSS selector(s) for elements that should receive a "Mediathek" button.
   * Matches `<input type="text">`, `<textarea>`, and any element with
   * `data-blossom` or `role="blossom-upload"`.
   *
   * @example '.upload-field, [data-blossom], textarea.content'
   */
  targets?: string;

  /**
   * Application ID used to scope user settings in localStorage.
   * Defaults to `'default'`.  Use different IDs if multiple widget instances
   * on the same page need independent settings.
   */
  appId?: string;

  /**
   * List of Blossom server base URLs.
   * @example ['https://blossom.primal.net', 'https://nostr.download']
   */
  servers: string[];

  /**
   * Nostr signer used for upload auth and event publishing.
   * Must implement `getPublicKey()` and `signEvent()`.
   *
   * If omitted, the widget falls back to `window.nostr` (NIP-07 browser
   * extension) if available. Without a signer, upload/delete/publish is
   * disabled and the gallery shows only cached items.
   */
  signer?: BlossomSigner;

  /**
   * Relay WebSocket URL for NIP-94 event fetching and publishing.
   * @example 'wss://relay.damus.io'
   */
  relayUrl?: string;

  /**
   * Feature toggles. All features are enabled by default.
   */
  features?: BlossomMediaFeatures;

  /**
   * Base URL of the image-describer / vision API.
   * Required to enable the AI description suggestion button.
   * @example 'https://my-host.example/api/vision'
   */
  visionEndpoint?: string;

  /**
   * How the selected URL is written back to target elements.
   * Defaults to `'url'`.
   */
  insertMode?: InsertMode;

  /**
   * Additional custom tabs (reserved for future extension points).
   * @experimental
   */
  tabs?: CustomTab[];

  // ─── Callbacks ─────────────────────────────────────────────────────────────

  /**
   * Called when the user clicks "Übernehmen" (apply / insert).
   * @param result - Full metadata of the inserted file
   * @param targetElement - The input/textarea the file was inserted into
   */
  onInsert?: (result: InsertResult, targetElement: HTMLElement | null) => void;

  /**
   * Called immediately after a successful upload (before metadata dialog).
   * @param result - Upload result tags including url, sha256, mime, etc.
   */
  onUpload?: (tags: string[][], url: string) => void;

  /**
   * Called after a file is deleted.
   * @param url - URL of the deleted file
   */
  onDelete?: (url: string) => void;

  /**
   * Called when an unrecoverable error occurs (upload failure, etc.).
   */
  onError?: (error: Error) => void;
}

// ─── Instance API ─────────────────────────────────────────────────────────────

/**
 * Handle returned by `BlossomMedia.init()`.
 * Allows programmatic control of the widget after initialization.
 */
export interface BlossomMediaInstance {
  /**
   * Programmatically open the media dialog.
   * @param targetElement - Optional: the element to insert the result into.
   *                        Overrides the element that was clicked.
   */
  open: (targetElement?: HTMLElement) => void;

  /** Programmatically close the media dialog. */
  close: () => void;

  /**
   * Remove the widget from the DOM, disconnect MutationObserver,
   * and clean up all injected buttons.
   */
  destroy: () => void;
}
