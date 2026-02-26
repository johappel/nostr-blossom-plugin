<script lang="ts">
  import type { UploadHistoryItem } from '../core/history';
  import type { Nip94FetchResult } from '../core/nip94';
  import type { InsertResult, BlossomMediaFeatures } from './types';
  import type { BlossomSigner } from '../core/types';
  import type { VisionClientOptions } from '../core/vision';
  import { formatLicenseDisplay } from '../core/licenses';
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

  /**
   * NIP-94 + local history merge.
   * NIP-94 events are the primary source; local-only items appended.
   */
  let mergedItems = $derived.by(() => {
    const result: UploadHistoryItem[] = [];
    const seenUrls = new Set<string>();
    const seenHashes = new Set<string>();

    if (nip94Data) {
      for (const ev of nip94Data.events) {
        if (seenUrls.has(ev.url)) continue;
        seenUrls.add(ev.url);
        if (ev.sha256) seenHashes.add(ev.sha256.toLowerCase());

        const localItem = items.find(
          (i) =>
            i.url === ev.url ||
            (i.sha256 && ev.sha256 && i.sha256.toLowerCase() === ev.sha256.toLowerCase()),
        );

        result.push({
          url: ev.url,
          mime: ev.mime || localItem?.mime || undefined,
          sha256: ev.sha256 || localItem?.sha256 || undefined,
          createdAt: localItem?.createdAt ?? new Date(ev.createdAt * 1000).toISOString(),
          metadata: ev.metadata,
          uploadTags: localItem?.uploadTags ?? ev.tags,
          publishedEventIds: localItem?.publishedEventIds ?? [ev.eventId],
          publishedKinds: localItem?.publishedKinds ?? [1063],
        });
      }
    }

    for (const item of items) {
      if (seenUrls.has(item.url)) continue;
      if (item.sha256 && seenHashes.has(item.sha256.toLowerCase())) continue;
      seenUrls.add(item.url);
      if (item.sha256) seenHashes.add(item.sha256.toLowerCase());
      result.push(item);
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
    selectedItem ? !items.some((i) => i.url === selectedItem!.url) : false,
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
    selectedUrl = url;
    deleteConfirmUrl = null;
  }

  function handleApply() {
    if (!selectedItem) return;
    onInserted(buildInsertResult(selectedItem));
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
      placeholder="Suchen: keyword, mime, autor…"
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

  {#if allKeywords.length > 0}
    <div class="keyword-bar">
      {#each allKeywords as kw}
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
            <!-- Preview -->
            {@const previewUrl = getPreviewUrl(selectedItem)}
            {#if previewUrl}
              <img class="sidebar-preview" src={previewUrl} alt={selectedItem.metadata?.altAttribution || ''} />
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
              </dl>
            {:else}
              <!-- Vision sidebar for items without metadata -->
              {#if visionOptions && features.aiDescription}
                <MetadataSidebar
                  fileUrl={selectedItem.url}
                  mime={selectedItem.mime ?? 'application/octet-stream'}
                  thumbnailUrl={getPreviewUrl(selectedItem)}
                  mode="create"
                  {visionOptions}
                  showDelete={features.deleteFiles && !isRemoteOnly}
                  showMetadata={true}
                  onSubmit={(meta) => {
                    if (selectedItem) {
                      onInserted({ ...buildInsertResult(selectedItem), ...meta, keywords: meta.keywords });
                    }
                  }}
                  onDelete={features.deleteFiles && !isRemoteOnly ? handleDeleteClick : undefined}
                />
              {/if}
            {/if}

            <!-- Action buttons -->
            {#if selectedItem.metadata}
              <div class="sidebar-actions">
                {#if onEditMetadata}
                  <button
                    type="button"
                    class="btn-secondary"
                    onclick={() => onEditMetadata?.(selectedItem!)}
                  >Metadaten bearbeiten ✏️</button>
                {/if}
                {#if features.deleteFiles && !isRemoteOnly}
                  <button type="button" class="btn-delete" onclick={handleDeleteClick}>🗑 Löschen</button>
                {/if}
                <button type="button" class="btn-primary" onclick={handleApply}>Übernehmen</button>
              </div>
            {/if}
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
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .btn-refresh {
    font: inherit;
    padding: 0.4rem 0.7rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #f5f5f5;
    cursor: pointer;
    font-size: 1rem;
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .keyword-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .keyword-tag {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid #bbb;
    border-radius: 99px;
    background: #f5f5f5;
    cursor: pointer;
    color: #555;
  }

  .keyword-tag.active {
    background: #6c63ff;
    border-color: #6c63ff;
    color: #fff;
  }

  .hint {
    color: #888;
    font-size: 0.875rem;
    text-align: center;
    padding: 2rem;
  }

  .error {
    color: #c0392b;
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
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    overflow: hidden;
    background: #f8f8f8;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s;
  }

  .thumb-btn.selected {
    border-color: #6c63ff;
    box-shadow: 0 0 0 2px #c5c2ff;
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
    overflow-y: auto;
    border-left: 1px solid #eee;
    padding-left: 0.75rem;
    display: grid;
    gap: 0.5rem;
    align-content: start;
  }

  .sidebar-preview {
    max-width: 100%;
    max-height: 160px;
    object-fit: contain;
    border-radius: 6px;
    border: 1px solid #ddd;
    background: #f8f8f8;
  }

  .pdf-preview {
    padding: 0.75rem;
    background: #f5f5f5;
    border-radius: 6px;
    text-align: center;
    font-size: 0.85rem;
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
    color: #777;
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

  .sidebar-actions {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.25rem;
  }

  .delete-confirm {
    padding: 0.75rem;
    background: #fdf0ee;
    border: 1px solid #f0c8c2;
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

  .btn-primary {
    font: inherit;
    padding: 0.45rem 0.9rem;
    background: #6c63ff;
    color: #fff;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
    width: 100%;
  }

  .btn-primary:hover {
    background: #5a52d5;
  }

  .btn-secondary {
    font: inherit;
    padding: 0.45rem 0.9rem;
    background: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
    width: 100%;
    text-align: center;
  }

  .btn-delete {
    font: inherit;
    padding: 0.45rem 0.9rem;
    background: #fff;
    color: #c0392b;
    border: 1px solid #c0392b;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
    width: 100%;
  }

  .btn-delete:hover {
    background: #fdf0ee;
  }

  .btn-danger {
    font: inherit;
    padding: 0.35rem 0.7rem;
    background: #c0392b;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }
</style>
