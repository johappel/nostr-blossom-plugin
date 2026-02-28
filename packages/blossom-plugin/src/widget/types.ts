/**
 * Configuration types for the Blossom Media Widget.
 *
 * The widget is a self-contained, embeddable media library (similar to the
 * WordPress media picker) that can be injected into any HTML page via a
 * `<script>` tag or ESM import.
 */

import type { BlossomSigner } from '../core/types';
import type { UploadHistoryItem } from '../core/history';
import type { Nip94FetchResult, Nip94FileEvent } from '../core/nip94';
import type { BlossomUserSettings } from '../core/settings';
import type { Component } from 'svelte';

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
  /** Show the "Bild erstellen" image generation tab */
  imageGen?: boolean;
  /** Show the AI description suggestion button in the metadata form */
  aiDescription?: boolean;
  /** Show the full metadata form (description, alt, author, license, …) */
  metadata?: boolean;
  /** Allow deleting files from gallery */
  deleteFiles?: boolean;
  /** Show the "Community Media" tab (built-in tab-communikey plugin) */
  community?: boolean;
}

// ─── Custom tabs ─────────────────────────────────────────────────────────────

/**
 * Interface for adding custom tabs to the media widget.
 * @deprecated Use `TabPlugin` instead — `CustomTab` is kept for backwards compatibility.
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

// ─── Widget event system ─────────────────────────────────────────────────────

/**
 * Map of events that can be observed on the widget context.
 * Plugin authors can subscribe via `ctx.on(event, handler)`.
 */
export interface WidgetEventMap {
  /** Fired when the signer changes (available, changed, or removed). */
  'signer-changed': BlossomSigner | null;
  /** Fired when user settings are updated (servers, relays, etc.). */
  'settings-changed': BlossomUserSettings;
  /** Fired after the gallery finishes (re-)loading. */
  'gallery-loaded': { items: UploadHistoryItem[]; nip94Data: Nip94FetchResult | null };
  /** Fired when the active tab changes. */
  'tab-changed': string;
  /** Fired when the widget dialog opens. */
  'open': void;
  /** Fired when the widget dialog closes. */
  'close': void;
  /** Fired after a share target handler completes successfully. */
  'share-completed': { targetId: string; item: UploadHistoryItem };
}

// ─── Widget context (plugin API) ─────────────────────────────────────────────

/**
 * Context object provided to tab plugins.
 *
 * All property getters return **current** values — they read from the
 * widget's internal reactive state but are themselves plain getters, so
 * they are safe to use from vanilla JS (no Svelte proxy issues with NIP-07
 * extension objects).
 */
export interface WidgetContext {
  // ── Reactive getters ────────────────────────────────────────────────────
  /** Current Nostr signer (NIP-07, NIP-46 bunker, or host-provided). `null` if unavailable. */
  readonly signer: BlossomSigner | null;
  /** Effective Blossom server URLs (config merged with user settings). */
  readonly servers: string[];
  /** Effective relay WebSocket URLs. */
  readonly relayUrls: string[];
  /** Gallery items (bloblist). */
  readonly items: UploadHistoryItem[];
  /** NIP-94 event data for gallery items. */
  readonly nip94Data: Nip94FetchResult | null;
  /** Current user settings. */
  readonly userSettings: BlossomUserSettings;
  /** ID of the currently active tab. */
  readonly activeTab: string;
  /** The HTML element that triggered the dialog open (for insert-back). */
  readonly targetElement: HTMLElement | null;
  /** The raw widget configuration. */
  readonly config: BlossomMediaConfig;

  // ── Actions ─────────────────────────────────────────────────────────────
  /** Insert a result (triggers `onInsert` callback and closes the dialog). */
  insert(result: InsertResult): void;
  /** Refresh the gallery (re-fetch bloblist + NIP-94 events). */
  refreshGallery(): void;
  /** Close the widget dialog. */
  close(): void;
  /** Switch to a different tab by ID. */
  switchTab(tabId: string): void;
  /** Show an error to the user / fire `onError`. */
  reportError(error: Error): void;

  // ── Event emitter ───────────────────────────────────────────────────────
  /** Subscribe to a widget event. Returns an unsubscribe function. */
  on<K extends keyof WidgetEventMap>(event: K, handler: (payload: WidgetEventMap[K]) => void): () => void;
  /** Unsubscribe from a widget event. */
  off<K extends keyof WidgetEventMap>(event: K, handler: (payload: WidgetEventMap[K]) => void): void;
}

// ─── Share targets ───────────────────────────────────────────────────────────

/**
 * A share target registered by a tab plugin.
 *
 * When a user views a gallery item, share targets appear in the sidebar
 * toolbar's share popover.  Clicking one executes the handler, which can
 * publish the item to external systems (e.g. Communikey communities,
 * AMB NIP events, etc.).
 */
export interface ShareTarget {
  /** Unique identifier (e.g. `'communikey-share'`). */
  id: string;
  /** Display label in the share popover (e.g. `'An Community teilen'`). */
  label: string;
  /** Optional icon (emoji or SVG) shown before the label. */
  icon?: string;
  /**
   * Called when the user selects this share target.
   *
   * @param item     - The gallery item being shared.
   * @param nip94    - The NIP-94 event for this item (contains `eventId`).
   * @param ctx      - Widget context for accessing signer, relays, actions.
   * @returns May return a Promise; errors are caught and reported.
   */
  handler: (
    item: UploadHistoryItem,
    nip94: Nip94FileEvent,
    ctx: WidgetContext,
  ) => void | Promise<void>;
}

// ─── Tab plugin ──────────────────────────────────────────────────────────────

/**
 * Definition of an external tab plugin.
 *
 * Exactly **one** of `render` or `component` must be provided:
 * - `render` — vanilla DOM: receives a container `<div>` and a `WidgetContext`.
 * - `component` — Svelte 5 component: mounted automatically with `{ ctx }` props.
 */
export interface TabPlugin {
  /** Unique tab identifier. Must not collide with builtin IDs (`upload`, `gallery`, `imagegen`). */
  id: string;
  /** Label displayed in the tab bar. */
  label: string;
  /** Optional icon (SVG string, emoji, or URL) displayed before the label. */
  icon?: string;
  /**
   * Sort order. Builtin tabs use 0–99; plugins default to 100.
   * Lower numbers appear first.
   */
  order?: number;

  // ── Rendering (exactly one required) ───────────────────────────────────
  /**
   * Vanilla-DOM render function.
   * Called once when the tab container mounts. Must render into `container`.
   * May return a cleanup function called on destroy.
   */
  render?: (container: HTMLElement, ctx: WidgetContext) => (() => void) | void;

  /**
   * Svelte 5 component reference.
   * The component will receive `ctx: WidgetContext` as a prop.
   */
  component?: Component<{ ctx: WidgetContext }>;

  // ── Lifecycle hooks (optional) ─────────────────────────────────────────
  /** Called each time this tab becomes the active tab. */
  onActivate?: (ctx: WidgetContext) => void;
  /** Called each time this tab is deactivated (another tab selected). */
  onDeactivate?: (ctx: WidgetContext) => void;
  /** Called when the widget is destroyed. Use for final cleanup. */
  onDestroy?: (ctx: WidgetContext) => void;

  // ── Share integration (optional) ─────────────────────────────────────
  /**
   * Share targets provided by this plugin.
   * They appear in the gallery sidebar toolbar's share popover.
   */
  shareTargets?: ShareTarget[];
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
   * Base URL of the image generation API.
   * Required to enable the "Bild erstellen" tab.
   * Falls back to `visionEndpoint` (same server, `/image-gen` route) if not set.
   * @example 'https://my-host.example/image-gen'
   */
  imageGenEndpoint?: string;

  /**
   * How the selected URL is written back to target elements.
   * Defaults to `'url'`.
   */
  insertMode?: InsertMode;

  /**
   * Additional custom tabs (reserved for future extension points).
   * @deprecated Use `plugins` instead for the full plugin API.
   * @experimental
   */
  tabs?: CustomTab[];

  /**
   * Tab plugins to register with the widget.
   *
   * Each plugin adds a tab to the tab bar. Plugins receive a `WidgetContext`
   * for accessing shared state (signer, servers, items, etc.) and actions
   * (insert, refreshGallery, close, etc.).
   *
   * @example
   * ```ts
   * BlossomMedia.init({
   *   servers: ['https://blossom.example.com'],
   *   plugins: [myAmbTabPlugin, myCommunikeyPlugin],
   * });
   * ```
   */
  plugins?: TabPlugin[];

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

  /**
   * Called when a signer becomes available (NIP-07 detected, NIP-46 bunker
   * connected, or host-provided signer loaded). Useful for updating external
   * status indicators (e.g. bookmarklet status bar).
   *
   * @param pubkey - The hex public key of the active signer.
   */
  onSignerReady?: (pubkey: string) => void;

  /**
   * Called when the widget dialog is closed (by user clicking X, pressing
   * Escape, or programmatic close). Useful for showing a re-open button
   * in popup/bookmarklet scenarios.
   */
  onClose?: () => void;
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
   * @param tab - Optional: tab to activate when opening (e.g. 'upload' or 'gallery').
   */
  open: (targetElement?: HTMLElement, tab?: string) => void;

  /** Programmatically close the media dialog. */
  close: () => void;

  /**
   * Remove the widget from the DOM, disconnect MutationObserver,
   * and clean up all injected buttons.
   */
  destroy: () => void;
}
