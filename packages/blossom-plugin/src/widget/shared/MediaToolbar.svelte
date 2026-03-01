<!--
  MediaToolbar — Pinned bottom toolbar for MediaDetailSheet.

  Handles format selection (URL / Markdown / Markdown+Description) and the
  insert / copy action. Also hosts optional Share, Edit and Delete icon buttons
  identical in appearance to the GalleryTab sidebar-toolbar.

  Props:
    item          — The MediaDisplayItem being displayed
    insertModes   — Allowed output formats (default: url, markdown, markdown-desc)
    targetElement — If set the widget was opened from a host-page element;
                    the format is read from its `data-format` attribute and
                    the action button writes back to it.
    shareTargets  — ShareTarget[] from the gallery plugin system
    nip94Event    — Optional raw NIP-94 event needed by share target handlers
    widgetContext — WidgetContext for share / error reporting
    onInsert      — Called with the built InsertResult
    onDelete      — If provided, a delete icon button is rendered
    onEdit        — If provided, an edit icon button is rendered

  Accessibility:
    All icon buttons have title attributes. The share popover closes on Escape.
-->
<script lang="ts">
  import type { MediaDisplayItem, InsertResult, InsertMode, ShareTarget, WidgetContext } from '../types';
  import type { Nip94FileEvent } from '../../core/nip94';
  import { formatInsertResult, INSERT_MODE_LABELS } from '../../core/format';
  import { untrack } from 'svelte';

  interface MediaToolbarProps {
    item: MediaDisplayItem;
    insertModes?: InsertMode[];
    targetElement?: HTMLElement | null;
    shareTargets?: ShareTarget[];
    nip94Event?: Nip94FileEvent | null;
    widgetContext?: WidgetContext | null;
    onInsert: (result: InsertResult) => void;
    onDelete?: (() => void) | null;
    deleting?: boolean;
    onEdit?: (() => void) | null;
  }

  let {
    item,
    insertModes = ['url', 'markdown', 'markdown-desc'],
    targetElement = null,
    shareTargets = [],
    nip94Event = null,
    widgetContext = null,
    onInsert,
    onDelete = null,
    deleting = false,
    onEdit = null,
  }: MediaToolbarProps = $props();

  // ── State ───────────────────────────────────────────────────────────────────
  let insertMode = $state<InsertMode>(untrack(() => insertModes[0]) ?? 'url');
  let sharePopoverOpen = $state(false);
  let sharingTargetId = $state<string | null>(null);

  // ── Effective mode ──────────────────────────────────────────────────────────
  let hasTarget = $derived(!!targetElement);

  let effectiveMode = $derived.by((): InsertMode => {
    if (targetElement) {
      const fmt = targetElement.getAttribute('data-format');
      if (fmt && fmt in INSERT_MODE_LABELS) return fmt as InsertMode;
      return 'url';
    }
    return insertMode;
  });

  // ── Build InsertResult from MediaDisplayItem ────────────────────────────────
  function buildInsertResult(): InsertResult {
    return {
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      previewUrl: item.previewUrl,
      mimeType: item.mimeType,
      sha256: item.sha256,
      size: item.size,
      description: item.description,
      alt: item.name || undefined,
      author: item.author,
      license: item.license,
      licenseLabel: item.licenseLabel,
      genre: item.genre,
      keywords: item.keywords,
      tags: item.tags ?? [],
    };
  }

  // ── Handle insert / copy ────────────────────────────────────────────────────
  function handleApply() {
    const result = buildInsertResult();
    result.insertMode = effectiveMode;
    result.formattedText = formatInsertResult(result, effectiveMode);
    onInsert(result);
  }

  // ── Visible modes (only those in insertModes array) ─────────────────────────
  let visibleModes = $derived(
    insertModes.filter((m) => m in INSERT_MODE_LABELS) as InsertMode[],
  );
</script>

<div class="media-toolbar">
  <!-- Share popover (only when share targets + context are available) -->
  {#if shareTargets.length > 0 && widgetContext}
    <div class="share-wrapper">
      <button
        type="button"
        class="btn-icon"
        onclick={() => { sharePopoverOpen = !sharePopoverOpen; }}
        title="Teilen"
        aria-label="Teilen"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
        </svg>
      </button>
      {#if sharePopoverOpen}
        <div class="share-popover">
          {#each shareTargets as target (target.id)}
            <button
              type="button"
              class="share-option"
              disabled={sharingTargetId === target.id}
              onclick={async () => {
                if (!widgetContext || !nip94Event) {
                  widgetContext?.reportError(new Error('Kein NIP-94 Event für dieses Item vorhanden.'));
                  return;
                }
                sharePopoverOpen = false;
                sharingTargetId = target.id;
                try {
                  // ShareTarget.handler expects UploadHistoryItem — pass minimal compatible shape
                  const historyItem = {
                    url: item.url,
                    mime: item.mimeType,
                    sha256: item.sha256,
                    createdAt: item.date,
                    uploadTags: item.tags,
                  } as Parameters<typeof target.handler>[0];
                  await target.handler(historyItem, nip94Event!, widgetContext!);
                } catch (err) {
                  widgetContext?.reportError(err instanceof Error ? err : new Error(String(err)));
                } finally {
                  sharingTargetId = null;
                }
              }}
            >
              {#if target.icon}<span class="share-option-icon">{@html target.icon}</span>{/if}
              <span>{sharingTargetId === target.id ? 'Wird geteilt…' : target.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Edit button -->
  {#if onEdit}
    <button
      type="button"
      class="btn-icon"
      onclick={onEdit}
      title="Bearbeiten"
      aria-label="Bearbeiten"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
    </button>
  {/if}

  <!-- Delete button -->
  {#if onDelete}
    <button
      type="button"
      class="btn-icon btn-icon--danger"
      onclick={onDelete}
      disabled={deleting}
      title={deleting ? 'Löschen läuft…' : 'Datei löschen'}
      aria-label={deleting ? 'Löschen läuft' : 'Datei löschen'}
    >
      {#if deleting}
        <span aria-hidden="true">…</span>
      {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      {/if}
    </button>
  {/if}

  <!-- Format selector / badge + apply button -->
  {#if hasTarget}
    <span class="format-badge" title="Format: {INSERT_MODE_LABELS[effectiveMode]}">{INSERT_MODE_LABELS[effectiveMode]}</span>
    <button
      type="button"
      class="btn-icon btn-icon--accent"
      onclick={handleApply}
      title="Übernehmen"
      aria-label="Übernehmen"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    </button>
  {:else}
    <!-- Standalone: dropdown + copy button -->
    {#if visibleModes.length > 1}
      <select class="format-select" bind:value={insertMode} title="Ausgabeformat">
        {#each visibleModes as mode}
          <option value={mode}>{INSERT_MODE_LABELS[mode]}</option>
        {/each}
      </select>
    {:else}
      <span class="format-badge">{INSERT_MODE_LABELS[effectiveMode]}</span>
    {/if}
    <button
      type="button"
      class="btn-icon btn-icon--accent"
      onclick={handleApply}
      title="In Zwischenablage kopieren"
      aria-label="In Zwischenablage kopieren"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
      </svg>
    </button>
  {/if}
</div>

<style>
  .media-toolbar {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    padding: 0.5rem 0;
  }

  .btn-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 6px;
    background: var(--bm-input-bg, #fff);
    color: var(--bm-text-muted, #666);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .btn-icon:hover {
    background: var(--bm-accent-bg-subtle, #f0eeff);
    color: var(--bm-accent, #6c63ff);
  }

  .btn-icon:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn-icon--danger:hover {
    background: var(--bm-danger-bg, #fdf0ee);
    color: var(--bm-danger, #d63031);
  }

  .btn-icon--accent {
    background: var(--bm-accent, #6c63ff);
    color: #fff;
    border-color: var(--bm-accent, #6c63ff);
  }

  .btn-icon--accent:hover {
    background: var(--bm-accent-hover, #5a52d5);
    color: #fff;
  }

  .format-badge {
    flex: 1;
    font-size: 0.7rem;
    color: var(--bm-text-muted, #888);
    text-align: right;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .format-select {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 0.75rem;
    height: 28px;
    padding: 0 0.4rem;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 6px;
    background: var(--bm-input-bg, #fff);
    color: var(--bm-text, #222);
    cursor: pointer;
  }

  /* ── Share popover ── */
  .share-wrapper {
    position: relative;
  }

  .share-popover {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 6px;
    min-width: 200px;
    background: var(--bm-bg, #fff);
    border: 1px solid var(--bm-border, #ddd);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 0.3rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .share-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--bm-text, #222);
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
    transition: background 0.1s;
  }

  .share-option:hover {
    background: var(--bm-accent-bg-subtle, #f0eeff);
  }

  .share-option:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .share-option-icon {
    font-size: 1rem;
    line-height: 1;
    display: inline-flex;
    align-items: center;
  }

  .share-option-icon :global(svg) {
    width: 18px;
    height: 18px;
  }
</style>
