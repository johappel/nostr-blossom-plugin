<script lang="ts">
  import type { UploadHistoryItem } from '../core/history';
  import type { Nip94FetchResult } from '../core/nip94';
  import type { InsertResult, BlossomMediaFeatures, InsertMode } from './types';
  import type { BlossomSigner } from '../core/types';
  import type { VisionClientOptions } from '../core/vision';
  import { formatLicenseDisplay } from '../core/licenses';
  import { formatInsertResult, INSERT_MODE_LABELS } from '../core/format';
  import MetadataSidebar from './MetadataSidebar.svelte';

  interface GalleryTabProps {
    items: UploadHistoryItem[];
    nip94Data: Nip94FetchResult | null;
    loading: boolean;
    loadError: string;
    signer: BlossomSigner | null;
    servers: string[];
    relayUrl?: string;
    features: BlossomMediaFeatures;
    visionOptions?: VisionClientOptions;
    onInserted: (result: InsertResult) => void;
    onDelete: (item: UploadHistoryItem) => void;
    onRefresh: () => void;
    /** Emits when user clicks "Metadaten bearbeiten" for an item */
    onEditMetadata?: (item: UploadHistoryItem) => void;
  }

  let {
    items,
    nip94Data,
    loading,
    loadError,
    signer: _signer,
    servers: _servers,
    relayUrl: _relayUrl,
    features,
    visionOptions,
    onInserted,
    onDelete,
    onRefresh,
    onEditMetadata,
  }: GalleryTabProps = $props();

  let selectedUrl = $state<string | null>(null);
  let deleteConfirmUrl = $state<string | null>(null);
  let filterQuery = $state('');
  let activeKeyword = $state<string | null>(null);
  let copiedUrl = $state(false);
  let insertMode = $state<InsertMode>('url');

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      copiedUrl = true;
      setTimeout(() => (copiedUrl = false), 1500);
    } catch {
      /* clipboard not available */
    }
  }

  /**
   * NIP-94 is the single source of truth for the gallery.
   * Only items with a published NIP-94 event (kind 1063) are shown.
   * The bloblist (`items`) is only used for isLocal detection, not for display.
   */
  let mergedItems = $derived.by(() => {
    if (!nip94Data) return [];

    const result: UploadHistoryItem[] = [];
    const seenUrls = new Set<string>();

    for (const ev of nip94Data.events) {
      if (seenUrls.has(ev.url)) continue;
      seenUrls.add(ev.url);

      result.push({
        url: ev.url,
        mime: ev.mime || undefined,
        sha256: ev.sha256 || undefined,
        createdAt: new Date(ev.createdAt * 1000).toISOString(),
        metadata: ev.metadata,
        uploadTags: ev.tags,
        publishedEventIds: [ev.eventId],
        publishedKinds: [1063],
      });
    }

    return result;
  });

  let allKeywords = $derived.by(() => {
    const kws = new Set<string>();
    for (const item of mergedItems) {
      for (const kw of item.metadata?.keywords ?? []) {
        kws.add(kw.toLowerCase());
      }
    }
    return [...kws].sort();
  });

  /** Keywords filtered by search query — shows all when search is empty */
  let filteredKeywords = $derived.by(() => {
    const query = filterQuery.trim().toLowerCase();
    if (!query) return allKeywords;
    const terms = query.split(/[,\s]+/).filter(Boolean);
    return allKeywords.filter((kw) =>
      terms.some((term) => kw.includes(term)),
    );
  });

  let filteredItems = $derived.by(() => {
    const query = filterQuery.trim().toLowerCase();
    const keyword = activeKeyword?.toLowerCase();

    return mergedItems.filter((item) => {
      const keywords = item.metadata?.keywords?.map((k) => k.toLowerCase()) ?? [];

      if (keyword && !keywords.includes(keyword)) return false;

      if (!query) return true;
      const terms = query.split(/[,\s]+/).filter(Boolean);
      const desc = item.metadata?.description?.toLowerCase() ?? '';
      const alt = item.metadata?.altAttribution?.toLowerCase() ?? '';
      const author = item.metadata?.author?.toLowerCase() ?? '';
      const genre = item.metadata?.genre?.toLowerCase() ?? '';
      const mime = item.mime?.toLowerCase() ?? '';

      return terms.every(
        (term) =>
          keywords.some((k) => k.includes(term)) ||
          desc.includes(term) ||
          alt.includes(term) ||
          author.includes(term) ||
          genre.includes(term) ||
          mime.includes(term),
      );
    });
  });

  let selectedItem = $derived(
    selectedUrl ? mergedItems.find((item) => item.url === selectedUrl) ?? null : null,
  );

  let isRemoteOnly = $derived(
    selectedItem
      ? !items.some(
          (i) =>
            i.url === selectedItem!.url ||
            (i.sha256 && selectedItem!.sha256 && i.sha256.toLowerCase() === selectedItem!.sha256.toLowerCase()),
        )
      : false,
  );

  function getThumbnailUrl(item: UploadHistoryItem): string {
    const thumbTag = item.uploadTags?.find((t) => t[0] === 'thumb');
    if (thumbTag?.[1]) return thumbTag[1];
    if (item.mime?.startsWith('image/')) return item.url;
    return '';
  }

  function getPreviewUrl(item: UploadHistoryItem): string {
    const imageTag = item.uploadTags?.find((t) => t[0] === 'image');
    if (imageTag?.[1]) return imageTag[1];
    const thumbTag = item.uploadTags?.find((t) => t[0] === 'thumb');
    if (thumbTag?.[1]) return thumbTag[1];
    if (item.mime?.startsWith('image/')) return item.url;
    return '';
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  function buildInsertResult(item: UploadHistoryItem): InsertResult {
    return {
      url: item.url,
      thumbnailUrl: item.uploadTags?.find((t) => t[0] === 'thumb')?.[1],
      previewUrl: getPreviewUrl(item),
      mimeType: item.mime,
      sha256: item.sha256,
      size: item.uploadTags?.find((t) => t[0] === 'size')?.[1]
        ? Number(item.uploadTags!.find((t) => t[0] === 'size')![1])
        : undefined,
      description: item.metadata?.description,
      alt: item.metadata?.altAttribution,
      author: item.metadata?.author,
      license: item.metadata?.license,
      licenseLabel: item.metadata?.licenseLabel,
      genre: item.metadata?.genre,
      keywords: item.metadata?.keywords,
      tags: item.uploadTags ?? [],
    };
  }

  function handleSelect(url: string) {
    // Toggle: clicking the same item again deselects (closes sidebar on mobile)
    selectedUrl = selectedUrl === url ? null : url;
    deleteConfirmUrl = null;
  }

  function handleApply() {
    if (!selectedItem) return;
    const result = buildInsertResult(selectedItem);
    result.insertMode = insertMode;
    result.formattedText = formatInsertResult(result, insertMode);
    onInserted(result);
    selectedUrl = null;
    deleteConfirmUrl = null;
  }

  function handleDeleteClick() {
    if (selectedItem) deleteConfirmUrl = selectedItem.url;
  }

  function handleDeleteConfirm() {
    if (selectedItem && deleteConfirmUrl === selectedItem.url) {
      onDelete(selectedItem);
      selectedUrl = null;
      deleteConfirmUrl = null;
    }
  }

  function handleDeleteCancel() {
    deleteConfirmUrl = null;
  }

  function toggleKeyword(kw: string) {
    activeKeyword = activeKeyword === kw ? null : kw;
  }
</script>

<div class="gallery-tab">
  <!-- Toolbar -->
  <div class="toolbar">
    <input
      class="search-input"
      placeholder="Suchen: Schlagwort, Beschreibung, Autor, Typ…"
      bind:value={filterQuery}
    />
    <button
      type="button"
      class="btn-refresh"
      onclick={onRefresh}
      disabled={loading}
      title="Mediathek neu laden"
    >
      {loading ? '…' : '↺'}
    </button>
  </div>

  {#if filteredKeywords.length > 0}
    <div class="keyword-bar">
      {#each filteredKeywords as kw}
        <button
          type="button"
          class="keyword-tag"
          class:active={activeKeyword === kw}
          onclick={() => toggleKeyword(kw)}
        >{kw}</button>
      {/each}
    </div>
  {/if}

  {#if loadError}
    <p class="error">{loadError}</p>
  {/if}

  {#if loading && mergedItems.length === 0}
    <p class="hint">Lade Mediathek…</p>
  {:else if mergedItems.length === 0}
    <p class="hint">Noch keine Dateien vorhanden.</p>
  {:else}
    <div class="gallery-body">
      <!-- Grid -->
      <div class="gallery-grid">
        {#each filteredItems as item (item.url)}
          {@const thumb = getThumbnailUrl(item)}
          {@const isLocal = items.some((i) => i.url === item.url)}
          <button
            type="button"
            class="thumb-btn"
            class:selected={selectedUrl === item.url}
            onclick={() => handleSelect(item.url)}
            title={item.metadata?.description || item.url}
          >
            {#if thumb}
              <img src={thumb} alt={item.metadata?.altAttribution || item.metadata?.description || ''} loading="lazy" />
            {:else if item.mime?.includes('pdf')}
              <span class="thumb-placeholder">📄</span>
            {:else}
              <span class="thumb-placeholder">📁</span>
            {/if}
            {#if !isLocal}
              <span class="badge-remote" title="Nur auf Relay">☁</span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Sidebar -->
      {#if selectedItem}
        <div class="sidebar-panel">
          <button type="button" class="sidebar-close" onclick={() => (selectedUrl = null)} title="Schließen">✕</button>
          <!-- Delete confirm -->
          {#if deleteConfirmUrl === selectedItem.url}
            <div class="delete-confirm">
              <p>Datei wirklich löschen?</p>
              <div class="confirm-actions">
                <button type="button" class="btn-secondary" onclick={handleDeleteCancel}>Abbrechen</button>
                <button type="button" class="btn-danger" onclick={handleDeleteConfirm}>Löschen</button>
              </div>
            </div>
          {:else}
            <div class="sidebar-scroll">
              <!-- Preview (image-size from NIP-94 `image` tag) -->
              {#if getPreviewUrl(selectedItem)}
                <img class="sidebar-preview" src={getPreviewUrl(selectedItem)} alt={selectedItem.metadata?.altAttribution || ''} />
              {:else if selectedItem.mime?.includes('pdf')}
                <div class="pdf-preview">📄 PDF — <a href={selectedItem.url} target="_blank" rel="noreferrer">Öffnen</a></div>
              {/if}

              <!-- Metadata -->
              {#if selectedItem.metadata}
                <dl class="meta-list">
                  {#if selectedItem.metadata.description}
                    <dt>Beschreibung</dt>
                    <dd>{selectedItem.metadata.description}</dd>
                  {/if}
                  {#if selectedItem.metadata.altAttribution}
                    <dt>Alt-Text</dt>
                    <dd>{selectedItem.metadata.altAttribution}</dd>
                  {/if}
                  {#if selectedItem.metadata.author}
                    <dt>Autor</dt>
                    <dd>{selectedItem.metadata.author}</dd>
                  {/if}
                  {#if selectedItem.metadata.genre}
                    <dt>Genre</dt>
                    <dd>{selectedItem.metadata.genre}</dd>
                  {/if}
                  {#if selectedItem.metadata.license}
                    <dt>Lizenz</dt>
                    <dd>{formatLicenseDisplay(selectedItem.metadata.license, selectedItem.metadata.licenseLabel)}</dd>
                  {/if}
                  {#if selectedItem.metadata.keywords?.length}
                    <dt>Keywords</dt>
                    <dd>
                      {#each selectedItem.metadata.keywords as kw}
                        <button type="button" class="keyword-tag" class:active={activeKeyword === kw.toLowerCase()} onclick={() => toggleKeyword(kw.toLowerCase())}>{kw}</button>
                      {/each}
                    </dd>
                  {/if}
                  <dt>Datum</dt>
                  <dd>{formatDate(selectedItem.createdAt)}</dd>
                  {#if selectedItem.mime}
                    <dt>Typ</dt>
                    <dd>{selectedItem.mime}</dd>
                  {/if}
                  <dt>URL</dt>
                  <dd>
                    <button type="button" class="url-copy" onclick={() => copyUrl(selectedItem.url)} title="URL kopieren">
                      {#if copiedUrl}<svg class="icon-inline" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Kopiert!{:else}{selectedItem.url}{/if}
                    </button>
                  </dd>
                </dl>
              {:else}
                <!-- Basic info for items without full metadata -->
                <dl class="meta-list">
                  <dt>Datum</dt>
                  <dd>{formatDate(selectedItem.createdAt)}</dd>
                  {#if selectedItem.mime}
                    <dt>Typ</dt>
                    <dd>{selectedItem.mime}</dd>
                  {/if}
                  {#if selectedItem.sha256}
                    <dt>SHA-256</dt>
                    <dd class="mono">{selectedItem.sha256.slice(0, 16)}…</dd>
                  {/if}
                  <dt>URL</dt>
                  <dd>
                    <button type="button" class="url-copy" onclick={() => copyUrl(selectedItem.url)} title="URL kopieren">
                      {#if copiedUrl}<svg class="icon-inline" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Kopiert!{:else}{selectedItem.url}{/if}
                    </button>
                  </dd>
                </dl>
                <!-- Vision sidebar for items without metadata -->
                {#if visionOptions && features.aiDescription !== false}
                  <MetadataSidebar
                    fileUrl={selectedItem.url}
                    mime={selectedItem.mime ?? 'application/octet-stream'}
                    thumbnailUrl={getPreviewUrl(selectedItem)}
                    mode="create"
                    {visionOptions}
                    showDelete={features.deleteFiles !== false}
                    showMetadata={true}
                    onSubmit={(meta) => {
                      if (selectedItem) {
                        onInserted({ ...buildInsertResult(selectedItem), ...meta, keywords: meta.keywords });
                      }
                    }}
                    onDelete={features.deleteFiles !== false ? handleDeleteClick : undefined}
                  />
                {/if}
              {/if}
            </div>

            <!-- Toolbar pinned at bottom -->
            <div class="sidebar-toolbar">
              {#if onEditMetadata}
                <button
                  type="button"
                  class="btn-icon"
                  onclick={() => onEditMetadata?.(selectedItem!)}
                  title="Metadaten bearbeiten"
                ><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
              {/if}
              {#if features.deleteFiles !== false}
                <button type="button" class="btn-icon btn-icon--danger" onclick={handleDeleteClick} title="Datei löschen"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
              {/if}
              <select class="format-select" bind:value={insertMode} title="Ausgabeformat">
                {#each Object.entries(INSERT_MODE_LABELS) as [value, label]}
                  <option {value}>{label}</option>
                {/each}
              </select>
              <button type="button" class="btn-icon btn-icon--accent" onclick={handleApply} title="Übernehmen (kopieren)"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .gallery-tab {
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 0.5rem;
    height: 100%;
    overflow: hidden;
    padding: 0.5rem;
    box-sizing: border-box;
  }

  .toolbar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .search-input {
    flex: 1;
    font: inherit;
    font-size: 0.875rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 4px;
    background: var(--bm-input-bg, #fff);
    color: var(--bm-text, #222);
  }

  .search-input::placeholder {
    color: var(--bm-text-subtle, #888);
  }

  .btn-refresh {
    font: inherit;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 4px;
    background: var(--bm-bg-subtle, #f5f5f5);
    cursor: pointer;
    font-size: 1rem;
    color: var(--bm-text, #222);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .keyword-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    max-height: 5.4rem;
    overflow-y: auto;
    padding-right: 0.25rem;
  }

  .keyword-tag {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--bm-input-border, #bbb);
    border-radius: 99px;
    background: var(--bm-bg-subtle, #f5f5f5);
    cursor: pointer;
    color: var(--bm-text-muted, #555);
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .keyword-tag:hover {
    background: var(--bm-bg-muted, #eee);
    color: var(--bm-text, #333);
  }

  .keyword-tag.active {
    background: var(--bm-accent, #6c63ff);
    border-color: var(--bm-accent, #6c63ff);
    color: #fff;
  }

  .hint {
    color: var(--bm-text-subtle, #888);
    font-size: 0.875rem;
    text-align: center;
    padding: 2rem;
  }

  .error {
    color: var(--bm-danger, #c0392b);
    font-size: 0.875rem;
  }

  .gallery-body {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 0.75rem;
    overflow: hidden;
    min-height: 0;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 0.4rem;
    align-content: start;
    overflow-y: auto;
    padding-right: 0.25rem;
  }

  .thumb-btn {
    position: relative;
    aspect-ratio: 1;
    border: 2px solid var(--bm-border, #e0e0e0);
    border-radius: 6px;
    overflow: hidden;
    background: var(--bm-bg-subtle, #f8f8f8);
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .thumb-btn:hover {
    border-color: var(--bm-text-muted, #aaa);
  }

  .thumb-btn.selected {
    border-color: var(--bm-accent, #6c63ff);
    box-shadow: 0 0 0 2px var(--bm-accent-bg, #c5c2ff);
  }

  .thumb-btn img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumb-placeholder {
    font-size: 2rem;
    line-height: 1;
  }

  .badge-remote {
    position: absolute;
    top: 3px;
    right: 3px;
    font-size: 0.7rem;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    border-radius: 3px;
    padding: 0 3px;
  }

  .sidebar-panel {
    position: relative;
    border-left: 1px solid var(--bm-border-muted, #eee);
    padding-left: 0.75rem;
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 0;
    overflow: hidden;
    min-height: 0;
  }

  .sidebar-scroll {
    overflow-y: auto;
    display: grid;
    gap: 0.5rem;
    align-content: start;
    padding-bottom: 0.5rem;
    min-height: 0;
  }

  .sidebar-preview {
    max-width: 100%;
    max-height: 280px;
    object-fit: contain;
    border-radius: 6px;
    border: 1px solid var(--bm-border, #ddd);
    background: var(--bm-bg-subtle, #f8f8f8);
  }

  .pdf-preview {
    padding: 0.75rem;
    background: var(--bm-bg-subtle, #f5f5f5);
    border-radius: 6px;
    text-align: center;
    font-size: 0.85rem;
  }

  .pdf-preview a {
    color: var(--bm-accent, #6c63ff);
  }

  .meta-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.5rem;
    font-size: 0.8rem;
    margin: 0;
  }

  .meta-list dt {
    font-weight: 600;
    color: var(--bm-text-muted, #777);
    white-space: nowrap;
    align-self: start;
    padding-top: 2px;
  }

  .meta-list dd {
    margin: 0;
    word-break: break-word;
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    align-items: center;
  }

  .meta-list dd.mono {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    font-size: 0.75rem;
  }

  .url-copy {
    all: unset;
    cursor: pointer;
    font-size: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    word-break: break-all;
    color: var(--bm-accent, #6c63ff);
    padding: 0.15rem 0.3rem;
    border-radius: 3px;
    transition: background 0.12s;
  }

  .url-copy:hover {
    background: var(--bm-accent-bg-subtle, #f0eeff);
  }

  .sidebar-toolbar {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    padding: 0.5rem 0;
    border-top: 1px solid var(--bm-border-muted, #eee);
  }

  .sidebar-toolbar .btn-icon {
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

  .sidebar-toolbar .btn-icon:hover {
    background: var(--bm-accent-bg-subtle, #f0eeff);
    color: var(--bm-accent, #6c63ff);
  }

  .sidebar-toolbar .btn-icon--danger:hover {
    background: var(--bm-danger-bg, #fdf0ee);
    color: var(--bm-danger, #d63031);
  }

  .sidebar-toolbar .btn-icon--accent {
    background: var(--bm-accent, #6c63ff);
    color: #fff;
    border-color: var(--bm-accent, #6c63ff);
  }

  .sidebar-toolbar .btn-icon--accent:hover {
    background: var(--bm-accent-hover, #5a52d5);
    color: #fff;
  }

  .icon-inline {
    display: inline-block;
    vertical-align: -2px;
    margin-right: 2px;
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

  .delete-confirm {
    padding: 0.75rem;
    background: var(--bm-danger-bg, #fdf0ee);
    border: 1px solid var(--bm-danger-border, #f0c8c2);
    border-radius: 6px;
  }

  .delete-confirm p {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
  }

  .confirm-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .btn-secondary {
    font: inherit;
    padding: 0.45rem 0.9rem;
    background: var(--bm-bg-muted, #f0f0f0);
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
    text-align: center;
    white-space: nowrap;
    color: var(--bm-text, #222);
    transition: background 0.12s;
  }

  .btn-secondary:hover {
    background: var(--bm-bg-hover, #e8e8e8);
  }

  .btn-danger {
    font: inherit;
    padding: 0.35rem 0.7rem;
    background: var(--bm-danger, #c0392b);
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .sidebar-close {
    display: none;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 1px solid var(--bm-border, #ddd);
    background: var(--bm-bg-subtle, #f5f5f5);
    color: var(--bm-text-muted, #666);
    font-size: 1rem;
    cursor: pointer;
    z-index: 11;
    transition: background 0.12s;
  }

  .sidebar-close:hover {
    background: var(--bm-bg-hover, #e8e8e8);
  }

  /* ── Mobile: sidebar as overlay ── */
  @media (max-width: 640px) {
    .keyword-bar {
      display: none;
    }

    .gallery-tab {
      position: relative;
    }

    .gallery-body {
      grid-template-columns: 1fr;
    }

    .sidebar-panel {
      position: absolute;
      inset: 0;
      border-left: none;
      padding-left: 0;
      padding: 0.5rem;
      background: var(--bm-bg, #fff);
      z-index: 10;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
    }

    .sidebar-panel .sidebar-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .sidebar-panel .sidebar-toolbar {
      flex-shrink: 0;
    }

    .sidebar-close {
      display: flex;
    }
  }
</style>
