<script lang="ts">
  import type { UploadHistoryItem } from '../core/history';
  import type { Nip94FetchResult } from '../core/nip94';
  import type { ImageMetadataInput } from '../core/metadata';
  import type { InsertResult, BlossomMediaFeatures, MediaDisplayItem, ShareTarget, WidgetContext } from './types';
  import type { BlossomSigner } from '../core/types';
  import type { VisionClientOptions } from '../core/vision';
  import { formatLicenseDisplay } from '../core/licenses';
  import MetadataSidebar from './MetadataSidebar.svelte';
  import MediaCard from './shared/MediaCard.svelte';
  import MediaDetailSheet from './shared/MediaDetailSheet.svelte';
  import MediaGridSearchBar from './shared/MediaGridSearchBar.svelte';
  import MediaToolbar from './shared/MediaToolbar.svelte';

  interface GalleryTabProps {
    items: UploadHistoryItem[];
    nip94Data: Nip94FetchResult | null;
    loading: boolean;
    loadError: string;
    signer: BlossomSigner | null;
    servers: string[];
    relayUrls: string[];
    features: BlossomMediaFeatures;
    visionOptions?: VisionClientOptions;
    /** The host-page element that triggered the widget (if any) */
    targetElement?: HTMLElement;
    onInserted: (result: InsertResult) => void;
    onDelete: (item: UploadHistoryItem) => void;
    onRefresh: () => void;
    /** Emits when user clicks "Metadaten bearbeiten" for an item */
    onEditMetadata?: (item: UploadHistoryItem) => void;
    /** Share targets from registered plugins */
    shareTargets?: ShareTarget[];
    /** Widget context (needed by share target handlers) */
    widgetContext?: WidgetContext;
  }

  let {
    items,
    nip94Data,
    loading,
    loadError,
    signer: _signer,
    servers: _servers,
    relayUrls: _relayUrls,
    features,
    visionOptions,
    targetElement,
    onInserted,
    onDelete,
    onRefresh,
    onEditMetadata,
    shareTargets = [],
    widgetContext,
  }: GalleryTabProps = $props();

  let selectedUrl = $state<string | null>(null);
  let deleteConfirmUrl = $state<string | null>(null);
  let filterQuery = $state('');
  let activeKeyword = $state<string | null>(null);
  let copiedUrl = $state(false);

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

  function formatDate(iso: string, withTime = true) {
    try {
      return new Date(iso).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        ...(withTime
          ? {
              hour: '2-digit',
              minute: '2-digit',
            }
          : {}),
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

  /** Convert UploadHistoryItem → unified MediaDisplayItem for shared grid/sheet components. */
  function toDisplayItem(item: UploadHistoryItem): MediaDisplayItem {
    const isLocal = items.some(
      (i) =>
        i.url === item.url ||
        (i.sha256 && item.sha256 && i.sha256.toLowerCase() === item.sha256.toLowerCase()),
    );
    return {
      id: item.url,
      url: item.url,
      thumbnailUrl: item.uploadTags?.find((t) => t[0] === 'thumb')?.[1] ||
        (item.mime?.startsWith('image/') ? item.url : undefined),
      previewUrl: getPreviewUrl(item) || undefined,
      name: item.metadata?.altAttribution || item.metadata?.description || '',
      description: item.metadata?.description,
      author: item.metadata?.author,
      license: item.metadata?.license,
      licenseLabel: item.metadata?.licenseLabel,
      mimeType: item.mime,
      date: formatDate(item.createdAt, false),
      keywords: item.metadata?.keywords,
      genre: item.metadata?.genre,
      sha256: item.sha256,
      size: item.uploadTags?.find((t) => t[0] === 'size')?.[1]
        ? Number(item.uploadTags!.find((t) => t[0] === 'size')![1])
        : undefined,
      tags: item.uploadTags,
      badge: !isLocal ? { text: '☁', title: 'Nur auf Relay' } : undefined,
    };
  }

  function handleSelect(url: string) {
    // Toggle: clicking the same item again deselects (closes sheet)
    selectedUrl = selectedUrl === url ? null : url;
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
  <MediaGridSearchBar
    bind:value={filterQuery}
    placeholder="Suchen: Schlagwort, Beschreibung, Autor, Typ…"
    loading={loading}
    onRefresh={onRefresh}
    refreshTitle="Mediathek neu laden"
  />

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
          <MediaCard
            item={toDisplayItem(item)}
            selected={selectedUrl === item.url}
            onclick={() => handleSelect(item.url)}
          />
        {/each}
      </div>

      <!-- Detail sheet (overlay) -->
      <MediaDetailSheet
        open={!!selectedItem}
        onClose={() => { selectedUrl = null; deleteConfirmUrl = null; }}
      >
        {#snippet children()}
          {#if selectedItem}
            <!-- Preview -->
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
                  <button type="button" class="url-copy" onclick={() => copyUrl(selectedItem!.url)} title="URL kopieren">
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
                  <button type="button" class="url-copy" onclick={() => copyUrl(selectedItem!.url)} title="URL kopieren">
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
                  onSubmit={(meta: ImageMetadataInput) => {
                    if (selectedItem) {
                      onInserted({ ...buildInsertResult(selectedItem), ...meta, keywords: meta.keywords });
                    }
                  }}
                  onDelete={features.deleteFiles !== false ? handleDeleteClick : undefined}
                />
              {/if}
            {/if}
          {/if}
        {/snippet}

        {#snippet toolbar()}
          {#if selectedItem}
            {#if deleteConfirmUrl === selectedItem.url}
              <!-- Delete confirm row -->
              <div class="confirm-row">
                <span class="confirm-label">Datei wirklich löschen?</span>
                <button type="button" class="btn-secondary" onclick={handleDeleteCancel}>Abbrechen</button>
                <button type="button" class="btn-danger" onclick={handleDeleteConfirm}>Löschen</button>
              </div>
            {:else}
              <MediaToolbar
                item={toDisplayItem(selectedItem)}
                insertModes={['url', 'markdown', 'markdown-desc']}
                {targetElement}
                shareTargets={shareTargets}
                nip94Event={nip94Data?.byUrl?.get(selectedItem.url) ?? null}
                widgetContext={widgetContext ?? null}
                onInsert={(result) => { onInserted(result); selectedUrl = null; }}
                onDelete={features.deleteFiles !== false ? handleDeleteClick : null}
                onEdit={onEditMetadata ? () => onEditMetadata?.(selectedItem!) : null}
              />
            {/if}
          {/if}
        {/snippet}
      </MediaDetailSheet>
    </div>
  {/if}
</div>

<style>
  .gallery-tab {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: 100%;
    overflow: hidden;
    padding: 0.5rem;
    box-sizing: border-box;
  }

  .keyword-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    max-height: 2.6rem;
    overflow-y: auto;
    padding-right: .25rem;
  }

  .keyword-tag {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.1rem 0.3rem;
    border: 0px solid var(--bm-input-border, #bbb);
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
    position: relative;
    overflow: hidden;
    min-height: 0;
    flex: 1;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 140px));
    grid-auto-flow: row;
    grid-auto-rows: max-content;
    gap: 0.5rem;
    padding: 0.6rem;
    align-content: start;
    align-items: start;
    justify-content: start;
    overflow-y: auto;
    height: 100%;
    box-sizing: border-box;
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

  .icon-inline {
    display: inline-block;
    vertical-align: -2px;
    margin-right: 2px;
  }

  .confirm-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4rem 0;
  }

  .confirm-label {
    flex: 1;
    font-size: 0.85rem;
    color: var(--bm-danger, #c0392b);
  }

  .btn-secondary {
    font: inherit;
    padding: 0.35rem 0.7rem;
    background: var(--bm-bg-muted, #f0f0f0);
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
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
</style>
