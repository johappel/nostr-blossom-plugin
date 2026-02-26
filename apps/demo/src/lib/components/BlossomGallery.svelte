<script lang="ts">
  import type { UploadHistoryItem } from '$lib/stores/uploads';

  interface GalleryProps {
    items: UploadHistoryItem[];
    open: boolean;
    onSelect: (url: string) => void;
    onDelete: (item: UploadHistoryItem) => void;
    onClose: () => void;
  }

  let { items, open, onSelect, onDelete, onClose }: GalleryProps = $props();

  let selectedUrl = $state<string | null>(null);
  let deleteConfirmUrl = $state<string | null>(null);

  let selectedItem = $derived(
    selectedUrl ? items.find((item) => item.url === selectedUrl) ?? null : null,
  );

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
        <button type="button" class="gallery-close" onclick={handleClose} aria-label="Schließen">
          ✕
        </button>
      </header>

      <div class="gallery-body">
        <!-- Thumbnail grid -->
        <div class="gallery-grid-area">
          {#if items.length === 0}
            <p class="gallery-empty">Keine hochgeladenen Dateien vorhanden.</p>
          {:else}
            <div class="gallery-grid">
              {#each items as item (item.url)}
                {@const thumbUrl = getThumbnailUrl(item)}
                <button
                  type="button"
                  class="gallery-thumb"
                  class:selected={selectedUrl === item.url}
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
                  {:else}
                    <div class="gallery-thumb-placeholder">
                      <span class="thumb-icon">📁</span>
                      <span class="thumb-label">{formatMime(item.mime)}</span>
                    </div>
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

                {#if selectedItem.metadata}
                  <dt>Beschreibung</dt>
                  <dd>{selectedItem.metadata.description || '—'}</dd>

                  <dt>Alt-Attribution</dt>
                  <dd>{selectedItem.metadata.altAttribution || '—'}</dd>

                  <dt>Autor</dt>
                  <dd>{selectedItem.metadata.author || '—'}</dd>

                  <dt>Genre</dt>
                  <dd>{selectedItem.metadata.genre || '—'}</dd>

                  <dt>Lizenz</dt>
                  <dd>{formatLicense(selectedItem)}</dd>

                  {#if selectedItem.metadata.keywords?.length}
                    <dt>Keywords</dt>
                    <dd>{selectedItem.metadata.keywords.join(', ')}</dd>
                  {/if}

                  {#if selectedItem.metadata.aiImageMode}
                    <dt>KI-Bild</dt>
                    <dd>
                      {selectedItem.metadata.aiImageMode === 'generated'
                        ? 'KI generiert'
                        : 'Mit Hilfe von KI generiert'}
                    </dd>
                  {/if}
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
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid #e0e0e0;
    background: #fafafa;
  }

  .gallery-header h2 {
    margin: 0;
    font-size: 1.15rem;
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
</style>
