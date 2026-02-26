<script lang="ts">
  import type { UploadHistoryItem } from '$lib/stores/uploads';
  import type { BlossomBlobDescriptor } from '$lib/nostr/blossom-list';
  import type { Nip94FetchResult } from '$lib/nostr/nip94-fetch';

  interface GalleryProps {
    items: UploadHistoryItem[];
    open: boolean;
    loading: boolean;
    loadError: string;
    remoteBlobs: BlossomBlobDescriptor[];
    nip94Data: Nip94FetchResult | null;
    onSelect: (url: string) => void;
    onDelete: (item: UploadHistoryItem) => void;
    onClose: () => void;
    onRefresh: () => void;
  }

  let {
    items,
    open,
    loading,
    loadError,
    remoteBlobs,
    nip94Data,
    onSelect,
    onDelete,
    onClose,
    onRefresh,
  }: GalleryProps = $props();

  let selectedUrl = $state<string | null>(null);
  let deleteConfirmUrl = $state<string | null>(null);
  let filterQuery = $state('');

  /**
   * NIP-94-first merge strategy:
   * 1. Start with NIP-94 events as primary items (richest metadata).
   * 2. Add local upload history items not covered by NIP-94.
   * 3. Add remote Blossom blobs that are neither in NIP-94 nor local history (orphans).
   * 4. Filter out any URL that is a known thumb/image preview of another item.
   */
  let mergedItems = $derived.by(() => {
    const result: UploadHistoryItem[] = [];
    const seenUrls = new Set<string>();
    const seenHashes = new Set<string>();

    // Collect all known thumb/image preview URLs so we can exclude them
    const previewUrls = new Set<string>();

    // From NIP-94 events
    if (nip94Data) {
      for (const ev of nip94Data.events) {
        if (ev.thumbUrl) previewUrls.add(ev.thumbUrl);
        if (ev.imageUrl) previewUrls.add(ev.imageUrl);
      }
    }

    // From local upload history
    for (const item of items) {
      if (item.uploadTags) {
        for (const tag of item.uploadTags) {
          if ((tag[0] === 'thumb' || tag[0] === 'image') && tag[1]) {
            previewUrls.add(tag[1]);
          }
        }
      }
    }

    // ── Step 1: NIP-94 events (primary source, richest metadata) ──
    if (nip94Data) {
      for (const ev of nip94Data.events) {
        if (previewUrls.has(ev.url)) continue; // skip preview blobs
        if (seenUrls.has(ev.url)) continue;
        seenUrls.add(ev.url);
        if (ev.sha256) seenHashes.add(ev.sha256.toLowerCase());

        // Check if we have a matching local item for createdAt/uploadTags
        const localItem = items.find(
          (i) => i.url === ev.url || (i.sha256 && ev.sha256 && i.sha256.toLowerCase() === ev.sha256.toLowerCase()),
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

    // ── Step 2: Local upload history not yet covered ──
    for (const item of items) {
      if (previewUrls.has(item.url)) continue;
      if (seenUrls.has(item.url)) continue;
      if (item.sha256 && seenHashes.has(item.sha256.toLowerCase())) continue;
      seenUrls.add(item.url);
      if (item.sha256) seenHashes.add(item.sha256.toLowerCase());
      result.push(item);
    }

    // ── Step 3: Remote Blossom orphans (on server, no NIP-94, no local) ──
    for (const blob of remoteBlobs) {
      if (previewUrls.has(blob.url)) continue;
      if (seenUrls.has(blob.url)) continue;
      if (seenHashes.has(blob.sha256?.toLowerCase())) continue;
      seenUrls.add(blob.url);
      if (blob.sha256) seenHashes.add(blob.sha256.toLowerCase());

      const createdMs =
        typeof blob.created === 'number' && blob.created > 0
          ? blob.created * 1000
          : Date.now();

      result.push({
        url: blob.url,
        mime: blob.type || undefined,
        sha256: blob.sha256,
        createdAt: new Date(createdMs).toISOString(),
        uploadTags: [
          ['url', blob.url],
          ['x', blob.sha256],
          ...(blob.type ? [['m', blob.type]] : []),
          ...(blob.size ? [['size', String(blob.size)]] : []),
        ],
      });
    }

    return result;
  });

  /** All unique keywords across all items for quick-filter suggestions */
  let allKeywords = $derived.by(() => {
    const kws = new Set<string>();
    for (const item of mergedItems) {
      if (item.metadata?.keywords) {
        for (const kw of item.metadata.keywords) {
          kws.add(kw.toLowerCase());
        }
      }
    }
    return [...kws].sort();
  });

  /** Items filtered by keyword search */
  let filteredItems = $derived.by(() => {
    const query = filterQuery.trim().toLowerCase();
    if (!query) return mergedItems;

    const terms = query.split(/[,\s]+/).filter(Boolean);
    return mergedItems.filter((item) => {
      const keywords = item.metadata?.keywords?.map((k) => k.toLowerCase()) ?? [];
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

  /** Whether the selected item is remote-only (not in local history) */
  let isRemoteOnly = $derived(
    selectedItem ? !items.some((i) => i.url === selectedItem!.url) : false,
  );

  /** Whether the selected item has NIP-94 data from a relay */
  let hasNip94Data = $derived(
    selectedItem
      ? !!(nip94Data?.byUrl.get(selectedItem.url) ||
          (selectedItem.sha256 && nip94Data?.bySha256.get(selectedItem.sha256.toLowerCase())))
      : false,
  );

  /** Whether NIP-94 data was fetched (even if no match for current item) */
  let nip94Available = $derived(nip94Data != null && nip94Data.events.length > 0);

  function getThumbnailUrl(item: UploadHistoryItem): string {
    const thumbTag = item.uploadTags?.find((t) => t[0] === 'thumb');
    if (thumbTag?.[1]) return thumbTag[1];
    const mime = item.mime?.trim().toLowerCase() ?? '';
    if (mime.startsWith('image/')) return item.url;
    return '';
  }

  function getPreviewUrl(item: UploadHistoryItem): string {
    const imageTag = item.uploadTags?.find((t) => t[0] === 'image');
    if (imageTag?.[1]) return imageTag[1];
    const thumbTag = item.uploadTags?.find((t) => t[0] === 'thumb');
    if (thumbTag?.[1]) return thumbTag[1];
    const mime = item.mime?.trim().toLowerCase() ?? '';
    if (mime.startsWith('image/')) return item.url;
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

  function formatMime(mime?: string) {
    return mime?.trim() || 'Unbekannt';
  }

  function formatLicense(item: UploadHistoryItem) {
    const canonical = item.metadata?.license?.trim() || '';
    const label = item.metadata?.licenseLabel?.trim() || '';
    if (!canonical) return '—';
    return label ? `${label} (${canonical})` : canonical;
  }

  function handleSelect(url: string) {
    selectedUrl = url;
    deleteConfirmUrl = null;
  }

  function handleApply() {
    if (selectedUrl) {
      onSelect(selectedUrl);
      selectedUrl = null;
      deleteConfirmUrl = null;
    }
  }

  function handleDeleteClick() {
    if (selectedItem) {
      deleteConfirmUrl = selectedItem.url;
    }
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

  function handleClose() {
    selectedUrl = null;
    deleteConfirmUrl = null;
    filterQuery = '';
    onClose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (deleteConfirmUrl) {
        handleDeleteCancel();
      } else {
        handleClose();
      }
    }
  }

  function toggleKeywordFilter(keyword: string) {
    const lower = keyword.toLowerCase();
    const terms = filterQuery.split(/[,\s]+/).filter(Boolean).map((t) => t.toLowerCase());

    if (terms.includes(lower)) {
      filterQuery = terms.filter((t) => t !== lower).join(', ');
    } else {
      filterQuery = filterQuery.trim()
        ? `${filterQuery.trim()}, ${lower}`
        : lower;
    }
  }

  function isPdf(item: UploadHistoryItem) {
    return item.mime?.trim().toLowerCase() === 'application/pdf';
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="gallery-backdrop" role="presentation" onkeydown={handleKeydown}>
    <div
      class="gallery-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-title"
    >
      <header class="gallery-header">
        <h2 id="gallery-title">Blossom Mediathek</h2>
        <div class="gallery-filter">
          <input
            type="search"
            class="filter-input"
            bind:value={filterQuery}
            placeholder="Suche nach Keywords, Beschreibung, Autor…"
          />
          {#if allKeywords.length > 0}
            <div class="filter-chips">
              {#each allKeywords.slice(0, 20) as kw}
                {@const isActive = filterQuery.toLowerCase().includes(kw)}
                <button
                  type="button"
                  class="filter-chip"
                  class:active={isActive}
                  onclick={() => toggleKeywordFilter(kw)}
                >
                  {kw}
                </button>
              {/each}
              {#if allKeywords.length > 20}
                <span class="filter-chips-more">+{allKeywords.length - 20} weitere</span>
              {/if}
            </div>
          {/if}
        </div>
        <div class="gallery-header-actions">
          <button
            type="button"
            class="gallery-refresh"
            onclick={onRefresh}
            disabled={loading}
            aria-label="Aktualisieren"
          >
            {loading ? '⏳' : '🔄'}
          </button>
          <button type="button" class="gallery-close" onclick={handleClose} aria-label="Schließen">
            ✕
          </button>
        </div>
      </header>

      <div class="gallery-body">
        <!-- Thumbnail grid -->
        <div class="gallery-grid-area">
          {#if loading && filteredItems.length === 0}
            <p class="gallery-loading">Lade Dateien vom Blossom-Server…</p>
          {:else if filteredItems.length === 0 && filterQuery.trim()}
            <p class="gallery-empty">Keine Dateien für „{filterQuery.trim()}" gefunden.</p>
          {:else if filteredItems.length === 0}
            <p class="gallery-empty">Keine hochgeladenen Dateien vorhanden.</p>
          {:else}
            {#if loadError}
              <p class="gallery-warn">{loadError}</p>
            {/if}
            {#if loading}
              <p class="gallery-loading-inline">Aktualisiere…</p>
            {/if}
            <div class="gallery-grid">
              {#each filteredItems as item (item.sha256 ?? item.url)}
                {@const thumbUrl = getThumbnailUrl(item)}
                {@const isRemote = !items.some((i) => i.url === item.url)}
                <button
                  type="button"
                  class="gallery-thumb"
                  class:selected={selectedUrl === item.url}
                  class:remote-only={isRemote}
                  onclick={() => handleSelect(item.url)}
                  aria-label={item.metadata?.description || item.url}
                >
                  {#if thumbUrl}
                    <img
                      src={thumbUrl}
                      alt={item.metadata?.altAttribution || item.metadata?.description || 'Upload'}
                      loading="lazy"
                    />
                  {:else if isPdf(item)}
                    <div class="gallery-thumb-placeholder pdf">
                      <span class="thumb-icon">📄</span>
                      <span class="thumb-label">PDF</span>
                    </div>
                  {:else if item.mime?.startsWith('image/')}
                    <img
                      src={item.url}
                      alt={item.metadata?.altAttribution || 'Bild'}
                      loading="lazy"
                    />
                  {:else}
                    <div class="gallery-thumb-placeholder">
                      <span class="thumb-icon">📁</span>
                      <span class="thumb-label">{formatMime(item.mime)}</span>
                    </div>
                  {/if}
                  {#if isRemote}
                    <span class="remote-badge" title="Nur auf dem Server">☁</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Sidebar -->
        <aside class="gallery-sidebar">
          {#if selectedItem}
            {@const previewUrl = getPreviewUrl(selectedItem)}
            <div class="sidebar-preview">
              {#if previewUrl}
                <img
                  src={previewUrl}
                  alt={selectedItem.metadata?.altAttribution || selectedItem.metadata?.description || 'Vorschau'}
                  class="sidebar-preview-img"
                />
              {:else if isPdf(selectedItem)}
                <div class="sidebar-preview-placeholder">
                  <span>📄 PDF-Datei</span>
                  <a href={selectedItem.url} target="_blank" rel="noreferrer">Öffnen</a>
                </div>
              {:else}
                <div class="sidebar-preview-placeholder">
                  <span>Keine Vorschau verfügbar</span>
                </div>
              {/if}
            </div>

            <div class="sidebar-meta">
              <h3>Details</h3>
              {#if hasNip94Data}
                <p class="nip94-badge">📡 NIP-94 Metadaten vom Relay</p>
              {/if}
              {#if isRemoteOnly && !hasNip94Data}
                {#if nip94Available}
                  <p class="nip94-badge nip94-miss">☁ Orphan — auf dem Server, aber kein NIP-94 Event vorhanden</p>
                {:else if !nip94Data}
                  <p class="remote-note">☁ Nur auf dem Server — NIP-94 Abfrage fehlgeschlagen.</p>
                {:else}
                  <p class="remote-note">☁ Nur auf dem Server — keine NIP-94 Events gefunden.</p>
                {/if}
              {/if}

              <dl class="meta-list">
                <dt>URL</dt>
                <dd>
                  <a href={selectedItem.url} target="_blank" rel="noreferrer" class="meta-url">
                    {selectedItem.url}
                  </a>
                </dd>

                <dt>Typ</dt>
                <dd>{formatMime(selectedItem.mime)}</dd>

                <dt>Hochgeladen</dt>
                <dd>{formatDate(selectedItem.createdAt)}</dd>

                {#if selectedItem.sha256}
                  <dt>SHA-256</dt>
                  <dd class="meta-hash">{selectedItem.sha256}</dd>
                {/if}

                <dt>Beschreibung</dt>
                <dd>{selectedItem.metadata?.description || '—'}</dd>

                <dt>Alt-Attribution</dt>
                <dd>{selectedItem.metadata?.altAttribution || '—'}</dd>

                <dt>Autor</dt>
                <dd>{selectedItem.metadata?.author || '—'}</dd>

                <dt>Genre</dt>
                <dd>{selectedItem.metadata?.genre || '—'}</dd>

                <dt>Lizenz</dt>
                <dd>{formatLicense(selectedItem)}</dd>

                {#if selectedItem.metadata?.keywords?.length}
                  <dt>Keywords</dt>
                  <dd class="keyword-tags">
                    {#each selectedItem.metadata.keywords as kw}
                      <button
                        type="button"
                        class="keyword-tag"
                        onclick={() => toggleKeywordFilter(kw)}
                        title={'Nach "' + kw + '" filtern'}
                      >
                        {kw}
                      </button>
                    {/each}
                  </dd>
                {/if}

                {#if selectedItem.metadata?.aiImageMode}
                  <dt>KI-Bild</dt>
                  <dd>
                    {selectedItem.metadata.aiImageMode === 'generated'
                      ? 'KI generiert'
                      : 'Mit Hilfe von KI generiert'}
                  </dd>
                {/if}

                {#if selectedItem.publishedKinds?.length}
                  <dt>Published Kinds</dt>
                  <dd>{selectedItem.publishedKinds.join(', ')}</dd>
                {/if}

                {#if selectedItem.publishedEventIds?.length}
                  <dt>Event IDs</dt>
                  <dd class="meta-hash">
                    {#each selectedItem.publishedEventIds as eid}
                      <span class="event-id-badge">{eid.slice(0, 12)}…</span>
                    {/each}
                  </dd>
                {/if}
              </dl>

              <p class="gallery-count">
                {filteredItems.length} von {mergedItems.length} Dateien
              </p>
            </div>

            <div class="sidebar-actions">
              <button type="button" class="btn-apply" onclick={handleApply}>
                ✓ Übernehmen
              </button>

              {#if deleteConfirmUrl === selectedItem.url}
                <div class="delete-confirm">
                  <p class="delete-warn">
                    Datei und zugehörige Vorschaubilder sowie NIP-94 Events werden gelöscht. Fortfahren?
                  </p>
                  <div class="delete-confirm-actions">
                    <button type="button" class="btn-delete-confirm" onclick={handleDeleteConfirm}>
                      Endgültig löschen
                    </button>
                    <button type="button" class="btn-cancel" onclick={handleDeleteCancel}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              {:else}
                <button type="button" class="btn-delete" onclick={handleDeleteClick}>
                  🗑 Löschen
                </button>
              {/if}
            </div>
          {:else}
            <div class="sidebar-empty">
              <p>Wähle eine Datei aus der Galerie, um Details anzuzeigen.</p>
            </div>
          {/if}
        </aside>
      </div>
    </div>
  </div>
{/if}

<style>
  .gallery-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 1rem;
    z-index: 1000;
  }

  .gallery-dialog {
    width: min(1100px, 95vw);
    height: min(720px, 85vh);
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 12px;
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
  }

  .gallery-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid #e0e0e0;
    background: #fafafa;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .gallery-header h2 {
    margin: 0;
    font-size: 1.15rem;
    white-space: nowrap;
  }

  .gallery-filter {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .filter-input {
    width: 100%;
    padding: 0.35rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font: inherit;
    font-size: 0.85rem;
    background: #fff;
    outline: none;
    transition: border-color 0.15s;
  }

  .filter-input:focus {
    border-color: #0078ff;
    box-shadow: 0 0 0 2px rgba(0, 120, 255, 0.1);
  }

  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .filter-chip {
    display: inline-block;
    padding: 2px 8px;
    font-size: 0.72rem;
    border: 1px solid #ddd;
    border-radius: 12px;
    background: #f5f5f5;
    color: #555;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
    font-family: inherit;
    line-height: 1.4;
  }

  .filter-chip:hover {
    background: #e8f4fd;
    border-color: #a0c4ff;
  }

  .filter-chip.active {
    background: #0078ff;
    color: #fff;
    border-color: #0078ff;
  }

  .filter-chips-more {
    font-size: 0.72rem;
    color: #999;
    padding: 2px 4px;
  }

  .gallery-header-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .gallery-refresh {
    background: none;
    border: none;
    font-size: 1.15rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    color: #666;
  }

  .gallery-refresh:hover:not(:disabled) {
    background: #eee;
    color: #333;
  }

  .gallery-refresh:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .gallery-close {
    background: none;
    border: none;
    font-size: 1.3rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    color: #666;
  }

  .gallery-close:hover {
    background: #eee;
    color: #333;
  }

  .gallery-body {
    display: grid;
    grid-template-columns: 1fr 320px;
    overflow: hidden;
  }

  .gallery-grid-area {
    padding: 1rem;
    overflow-y: auto;
  }

  .gallery-empty {
    color: #888;
    text-align: center;
    padding: 3rem 1rem;
  }

  .gallery-loading {
    color: #666;
    text-align: center;
    padding: 3rem 1rem;
    font-style: italic;
  }

  .gallery-loading-inline {
    color: #666;
    font-size: 0.85rem;
    font-style: italic;
    margin: 0 0 0.5rem;
  }

  .gallery-warn {
    color: #b45309;
    font-size: 0.82rem;
    margin: 0 0 0.5rem;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }

  .gallery-thumb {
    position: relative;
    aspect-ratio: 1;
    border: 3px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    background: #f5f5f5;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .gallery-thumb:hover {
    border-color: #a0c4ff;
    box-shadow: 0 0 0 2px rgba(0, 120, 255, 0.15);
  }

  .gallery-thumb.selected {
    border-color: #0078ff;
    box-shadow: 0 0 0 3px rgba(0, 120, 255, 0.25);
  }

  .gallery-thumb.remote-only {
    opacity: 0.85;
  }

  .remote-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.8rem;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .remote-note {
    font-size: 0.82rem;
    color: #0078ff;
    margin: 0 0 0.4rem;
    padding: 0.3rem 0.5rem;
    background: #e8f4fd;
    border-radius: 4px;
  }

  .gallery-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .gallery-thumb-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: #888;
    font-size: 0.75rem;
  }

  .gallery-thumb-placeholder .thumb-icon {
    font-size: 2rem;
  }

  .gallery-thumb-placeholder .thumb-label {
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  .gallery-sidebar {
    border-left: 1px solid #e0e0e0;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .sidebar-preview {
    padding: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    background: #f0f0f0;
    border-bottom: 1px solid #e0e0e0;
  }

  .sidebar-preview-img {
    max-width: 100%;
    max-height: 200px;
    border-radius: 6px;
    object-fit: contain;
  }

  .sidebar-preview-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    color: #888;
  }

  .sidebar-preview-placeholder a {
    font-size: 0.85rem;
  }

  .sidebar-meta {
    padding: 0.75rem 1rem;
    flex: 1;
    overflow-y: auto;
  }

  .sidebar-meta h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
    color: #555;
  }

  .meta-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.75rem;
    font-size: 0.82rem;
    margin: 0;
  }

  .meta-list dt {
    font-weight: 600;
    color: #555;
    white-space: nowrap;
  }

  .meta-list dd {
    margin: 0;
    word-break: break-all;
    color: #333;
  }

  .meta-url {
    font-size: 0.78rem;
    color: #0078ff;
  }

  .meta-hash {
    font-family: monospace;
    font-size: 0.72rem;
  }

  .event-id-badge {
    display: inline-block;
    background: #eee;
    border-radius: 4px;
    padding: 1px 5px;
    margin: 1px 2px;
    font-size: 0.72rem;
  }

  .sidebar-actions {
    padding: 0.75rem 1rem;
    border-top: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sidebar-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 2rem 1rem;
    color: #888;
    text-align: center;
  }

  .btn-apply {
    background: #0078ff;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.6rem 1rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-apply:hover {
    background: #005fcc;
  }

  .btn-delete {
    background: #fff;
    color: #d32f2f;
    border: 1px solid #d32f2f;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-delete:hover {
    background: #fce4ec;
  }

  .delete-confirm {
    border: 1px solid #d32f2f;
    border-radius: 6px;
    padding: 0.75rem;
    background: #fff5f5;
  }

  .delete-warn {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    color: #c62828;
  }

  .delete-confirm-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-delete-confirm {
    background: #d32f2f;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-delete-confirm:hover {
    background: #b71c1c;
  }

  .btn-cancel {
    background: #fff;
    color: #666;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: #f5f5f5;
  }

  .nip94-badge {
    font-size: 0.78rem;
    color: #7c3aed;
    background: #f3e8ff;
    border: 1px solid #ddd6fe;
    border-radius: 6px;
    padding: 0.25rem 0.5rem;
    margin: 0 0 0.4rem;
  }

  .nip94-badge.nip94-miss {
    color: #b45309;
    background: #fffbeb;
    border-color: #fde68a;
  }

  .keyword-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .keyword-tag {
    display: inline-block;
    padding: 1px 7px;
    font-size: 0.72rem;
    border: 1px solid #ddd;
    border-radius: 10px;
    background: #f5f5f5;
    color: #555;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s, border-color 0.12s;
  }

  .keyword-tag:hover {
    background: #e8f4fd;
    border-color: #a0c4ff;
    color: #0078ff;
  }

  .gallery-count {
    font-size: 0.75rem;
    color: #999;
    margin: 0.75rem 0 0;
    text-align: right;
  }
</style>
