<script lang="ts">
  import type { BlossomMediaConfig, CustomTab, InsertResult } from './types';
  import type { BlossomSigner } from '../core/types';
  import type { UploadHistoryItem } from '../core/history';
  import type { Nip94FetchResult } from '../core/nip94';
  import type { VisionClientOptions } from '../core/vision';
  import { listBlossomBlobs } from '../core/list';
  import { fetchNip94Events } from '../core/nip94';
  import { updateHistoryItemByUrl, removeHistoryItemByUrl } from '../core/history';
  import { deleteBlossomBlob, publishDeletionEvent } from '../core/delete';
  import { buildImageMetadataTags } from '../core/metadata';
  import { publishEvent } from '../core/publish';
  import { resolveVisionEndpoint } from '../core/vision';
  import { untrack } from 'svelte';
  import UploadTab from './UploadTab.svelte';
  import GalleryTab from './GalleryTab.svelte';
  import MetadataSidebar from './MetadataSidebar.svelte';

  interface MediaWidgetProps {
    config: BlossomMediaConfig;
    /** Element that triggered the open (for insert-back if needed) */
    targetElement?: HTMLElement;
    /** Whether the dialog is currently open */
    open?: boolean;
    onClose?: () => void;
  }

  let {
    config,
    targetElement: _targetElement,
    open = $bindable(false),
    onClose,
  }: MediaWidgetProps = $props();

  // ── Tabs ──────────────────────────────────────────────────────────────────
  type BuiltinTab = 'upload' | 'gallery';
  type TabId = BuiltinTab | string;

  interface TabDef {
    id: TabId;
    label: string;
    builtin?: BuiltinTab;
    custom?: CustomTab;
  }

  let tabs = $derived.by((): TabDef[] => {
    const result: TabDef[] = [];
    if (config.features?.upload !== false) {
      result.push({ id: 'upload', label: 'Dateien hochladen', builtin: 'upload' });
    }
    if (config.features?.gallery !== false) {
      result.push({ id: 'gallery', label: 'Mediathek', builtin: 'gallery' });
    }
    for (const ct of config.tabs ?? []) {
      result.push({ id: ct.id, label: ct.label, custom: ct });
    }
    return result;
  });

  let activeTab = $state<TabId>(untrack(() => tabs[0]?.id ?? 'upload'));

  // ── Signer ────────────────────────────────────────────────────────────────
  let signer = $derived.by<BlossomSigner | null>(() => {
    if (config.signer) return config.signer;
    if (typeof window !== 'undefined' && (window as Window & { nostr?: BlossomSigner }).nostr) {
      return (window as Window & { nostr?: BlossomSigner }).nostr ?? null;
    }
    return null;
  });

  // ── Gallery state ─────────────────────────────────────────────────────────
  let items = $state<UploadHistoryItem[]>([]);
  let nip94Data = $state<Nip94FetchResult | null>(null);
  let galleryLoading = $state(false);
  let galleryError = $state('');

  // ── Vision config ─────────────────────────────────────────────────────────
  let visionOptions = $derived.by<VisionClientOptions | undefined>(() => {
    const ep = config.visionEndpoint ? resolveVisionEndpoint(config.visionEndpoint) : null;
    return ep ? { endpoint: ep } : undefined;
  });

  // ── Edit-metadata overlay ─────────────────────────────────────────────────
  let editItem = $state<UploadHistoryItem | null>(null);

  // ── Dialog element ref ────────────────────────────────────────────────────
  let dialogEl = $state<HTMLDialogElement | null>(null);

  // Sync open state with <dialog>
  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
      loadGalleryIfNeeded();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  function handleDialogClose() {
    open = false;
    onClose?.();
  }

  function handleDialogClick(e: MouseEvent) {
    // Close when clicking the backdrop (the <dialog> itself)
    if (e.target === dialogEl) {
      open = false;
      onClose?.();
    }
  }

  // ── Gallery load ──────────────────────────────────────────────────────────
  async function loadGalleryIfNeeded() {
    if (!config.relayUrl && config.servers.length === 0) return;
    if (galleryLoading) return;

    galleryLoading = true;
    galleryError = '';

    try {
      const resolvedSigner = signer;

      // Load bloblist from servers
      if (config.servers.length > 0 && resolvedSigner) {
        const blobResult = await listBlossomBlobs(resolvedSigner, config.servers);
        const now = new Date().toISOString();
        const blobItems: UploadHistoryItem[] = blobResult.blobs.map((b) => ({
          url: b.url,
          sha256: b.sha256,
          mime: b.type,
          createdAt: b.created ? new Date(b.created * 1000).toISOString() : now,
          uploadTags: [
            ['url', b.url],
            ...(b.sha256 ? [['x', b.sha256]] : []),
            ...(b.type ? [['m', b.type]] : []),
            ...(b.size ? [['size', String(b.size)]] : []),
          ],
        }));

        // Merge: existing items win on url match, others appended
        const merged = [...blobItems];
        for (const existing of items) {
          if (!merged.some((m) => m.url === existing.url)) {
            merged.push(existing);
          }
        }
        items = merged;
      }

      // Load NIP-94 events from relay
      if (config.relayUrl && resolvedSigner) {
        nip94Data = await fetchNip94Events(resolvedSigner, [config.relayUrl]);
      }
    } catch (err) {
      galleryError = err instanceof Error ? err.message : 'Mediathek konnte nicht geladen werden';
    } finally {
      galleryLoading = false;
    }
  }

  // ── Handle insert ─────────────────────────────────────────────────────────
  function handleInserted(result: InsertResult) {
    config.onInsert?.(result, _targetElement ?? null);
    config.onUpload?.(result.tags, result.url);
    open = false;
    onClose?.();
  }

  // ── Handle delete ─────────────────────────────────────────────────────────
  // Deletes ALL blossom blobs linked in the NIP-94 event (original, thumb, image),
  // then publishes a NIP-09 deletion event for the NIP-94 event itself.
  async function handleDelete(item: UploadHistoryItem) {
    const resolvedSigner = signer;
    if (!resolvedSigner) return;

    try {
      // Find the NIP-94 event so we know all linked blossom URLs
      const nip94Event = nip94Data?.events.find(
        (ev) =>
          ev.url === item.url ||
          (item.sha256 && ev.sha256 && item.sha256.toLowerCase() === ev.sha256.toLowerCase()),
      );

      // Collect all SHA-256 hashes to delete from blossom servers
      const hashesToDelete = new Set<string>();

      if (item.sha256) hashesToDelete.add(item.sha256.toLowerCase());
      if (nip94Event?.sha256) hashesToDelete.add(nip94Event.sha256.toLowerCase());

      // Extract SHA-256 from derivative URLs (thumb, image)
      if (nip94Event) {
        for (const derivUrl of [nip94Event.thumbUrl, nip94Event.imageUrl]) {
          if (!derivUrl) continue;
          // Look up in bloblist first
          const blobItem = items.find((i) => i.url === derivUrl);
          if (blobItem?.sha256) {
            hashesToDelete.add(blobItem.sha256.toLowerCase());
          } else {
            // Extract SHA-256 from blossom URL (pattern: /server/<sha256> or /server/<sha256>.ext)
            const extracted = extractSha256FromUrl(derivUrl);
            if (extracted) hashesToDelete.add(extracted);
          }
        }
      }

      // 1) Delete all blobs from blossom servers
      if (config.servers.length > 0) {
        for (const hash of hashesToDelete) {
          try {
            await deleteBlossomBlob(resolvedSigner, config.servers, hash);
          } catch {
            // Partial failure is acceptable – continue with remaining hashes
          }
        }
      }

      // 2) Delete NIP-94 event via NIP-09
      const eventIds = item.publishedEventIds?.length
        ? item.publishedEventIds
        : nip94Event
          ? [nip94Event.eventId]
          : [];

      if (config.relayUrl && eventIds.length) {
        await publishDeletionEvent(
          resolvedSigner,
          config.relayUrl,
          eventIds,
          'Deleted via Blossom Media Widget',
        );
      }

      // 3) Remove from local state immediately
      items = removeHistoryItemByUrl(items, item.url);
      // Also remove derivative blobs from items
      if (nip94Event) {
        for (const dUrl of [nip94Event.thumbUrl, nip94Event.imageUrl]) {
          if (dUrl) items = removeHistoryItemByUrl(items, dUrl);
        }
      }

      if (nip94Data) {
        nip94Data = {
          ...nip94Data,
          events: nip94Data.events.filter((ev) => {
            if (ev.url === item.url) return false;
            if (
              item.sha256 &&
              ev.sha256 &&
              item.sha256.toLowerCase() === ev.sha256.toLowerCase()
            )
              return false;
            return true;
          }),
        };
      }

      config.onDelete?.(item.url);
    } catch (err) {
      config.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Extract SHA-256 hash from a blossom blob URL.
   * Blossom URLs follow the pattern: https://server/<sha256> or https://server/<sha256>.ext
   */
  function extractSha256FromUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const lastSegment = pathname.split('/').pop() ?? '';
      const withoutExt = lastSegment.replace(/\.[^.]+$/, '');
      if (/^[0-9a-f]{64}$/i.test(withoutExt)) return withoutExt.toLowerCase();
      return null;
    } catch {
      return null;
    }
  }

  // ── Handle edit metadata ──────────────────────────────────────────────────
  let editPreviousTab = $state<TabId>('gallery');
  let editSaving = $state(false);

  function handleEditMetadata(item: UploadHistoryItem) {
    editItem = item;
    editPreviousTab = activeTab; // remember which tab we came from
  }

  async function handleEditMetadataSubmit(metadata: import('../core/metadata').ImageMetadataInput) {
    if (!editItem) return;
    const resolvedSigner = signer;
    if (!resolvedSigner) return;

    editSaving = true;
    try {
      // Build updated NIP-94 tags from the existing upload tags + new metadata
      const uploadTags = editItem.uploadTags ?? [];
      const newTags = buildImageMetadataTags(uploadTags, metadata);

      // 1) Publish new NIP-94 kind 1063 event
      if (config.relayUrl) {
        const result = await publishEvent(
          resolvedSigner,
          config.relayUrl,
          metadata.description || '',
          newTags,
          1063,
        );

        const newEventId = (result.event as Record<string, unknown>).id as string;

        // 2) Delete old NIP-94 event(s) via NIP-09
        const oldEventIds = editItem.publishedEventIds?.filter((id) => id !== newEventId) ?? [];
        if (oldEventIds.length > 0) {
          try {
            await publishDeletionEvent(
              resolvedSigner,
              config.relayUrl,
              oldEventIds,
              'Replaced by updated NIP-94 event',
            );
          } catch {
            // Non-fatal: old event stays but new one supersedes it
          }
        }

        // 3) Update nip94Data locally so gallery shows changes immediately
        if (nip94Data) {
          // Remove old event(s)
          const updatedEvents = nip94Data.events.filter(
            (ev) => ev.url !== editItem!.url &&
              !(editItem!.sha256 && ev.sha256 && editItem!.sha256.toLowerCase() === ev.sha256.toLowerCase()),
          );

          // Parse the new event into a Nip94FileEvent-like structure
          const createdAt = (result.event as Record<string, unknown>).created_at as number;

          // Re-fetch NIP-94 data from relay to get properly parsed event
          // For immediate feedback, manually construct the parsed event
          const getTag = (tags: string[][], key: string) =>
            tags.find((t) => t[0] === key)?.[1]?.trim() ?? '';
          const getAllTags = (tags: string[][], key: string) =>
            tags.filter((t) => t[0] === key).map((t) => t[1]?.trim()).filter(Boolean) as string[];

          const parseAiMode = (tags: string[][]): 'generated' | 'assisted' | undefined => {
            const hints = getAllTags(tags, 'hint');
            if (hints.includes('ai-image-generated')) return 'generated';
            if (hints.includes('ai-image-assisted')) return 'assisted';
            return undefined;
          };

          updatedEvents.unshift({
            eventId: newEventId,
            createdAt: createdAt ?? Math.floor(Date.now() / 1000),
            content: metadata.description || '',
            url: getTag(newTags, 'url') || editItem.url,
            sha256: getTag(newTags, 'x') || editItem.sha256 || '',
            mime: getTag(newTags, 'm') || editItem.mime || '',
            tags: newTags,
            thumbUrl: getTag(newTags, 'thumb') || undefined,
            imageUrl: getTag(newTags, 'image') || undefined,
            metadata,
          });

          nip94Data = {
            events: updatedEvents,
            byUrl: new Map(updatedEvents.map((e) => [e.url, e])),
            bySha256: new Map(
              updatedEvents
                .filter((e) => e.sha256)
                .map((e) => [e.sha256.toLowerCase(), e]),
            ),
          };
        }
      }

      // Also update local items
      items = updateHistoryItemByUrl(items, editItem.url, { metadata });
    } catch (err) {
      config.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      editSaving = false;
      editItem = null;
      activeTab = editPreviousTab; // return to gallery (or wherever we came from)
    }
  }

  // ── Custom tab container ──────────────────────────────────────────────────
  let customContainers = $state<Record<string, HTMLElement>>({});

  $effect(() => {
    for (const tab of tabs) {
      if (!tab.custom) continue;
      const el = customContainers[tab.id];
      if (el && el.childElementCount === 0) {
        tab.custom.render(el);
      }
    }
  });

  // ── Keyboard close ───────────────────────────────────────────────────────
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      open = false;
      onClose?.();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialogEl}
  class="bm-dialog"
  onclose={handleDialogClose}
  onclick={handleDialogClick}
  onkeydown={handleKeydown}
>
  <div class="bm-dialog-inner" role="document">
    <!-- Header -->
    <header class="bm-header">
      <h2 class="bm-title">Mediathek</h2>
      <button
        type="button"
        class="bm-close"
        aria-label="Schließen"
        onclick={() => { open = false; onClose?.(); }}
      >✕</button>
    </header>

    <!-- Tab bar -->
    {#if tabs.length > 1}
      <div class="bm-tabs" role="tablist">
        {#each tabs as tab}
          <button
            type="button"
            role="tab"
            class="bm-tab"
            class:active={activeTab === tab.id}
            aria-selected={activeTab === tab.id}
            onclick={() => { activeTab = tab.id; editItem = null; }}
          >{tab.label}</button>
        {/each}
      </div>
    {/if}

    <!-- Content area -->
    <div class="bm-content">
      {#if editItem}
        <!-- Edit-metadata overlay (shown on top, tabs stay mounted underneath) -->
        <div class="bm-edit-overlay">
          <div class="edit-overlay-header">
            <button type="button" class="btn-back" onclick={() => { editItem = null; activeTab = editPreviousTab; }}>← Zurück</button>
            <span>Metadaten bearbeiten: {editItem.metadata?.description ?? editItem.url}</span>
          </div>
          <MetadataSidebar
            fileUrl={editItem.url}
            mime={editItem.mime ?? 'application/octet-stream'}
            thumbnailUrl={editItem.uploadTags?.find((t) => t[0] === 'thumb')?.[1]}
            initialMetadata={editItem.metadata}
            mode="edit"
            {visionOptions}
            showDelete={false}
            showMetadata={true}
            onSubmit={handleEditMetadataSubmit}
            onCancel={() => { editItem = null; activeTab = editPreviousTab; }}
          />
        </div>
      {/if}

      <!-- Tabs always stay mounted so selection state is preserved -->
      <div class="bm-tabs-content" hidden={!!editItem}>
        {#each tabs as tab}
          <div
            class="bm-tab-panel"
            class:active={activeTab === tab.id}
            role="tabpanel"
            hidden={activeTab !== tab.id}
          >
            {#if tab.builtin === 'upload'}
              <UploadTab
                {signer}
                servers={config.servers}
                relayUrl={config.relayUrl}
                features={config.features ?? {}}
                {visionOptions}
                onInserted={handleInserted}
              />
            {:else if tab.builtin === 'gallery'}
              <GalleryTab
                {items}
                {nip94Data}
                loading={galleryLoading}
                loadError={galleryError}
                {signer}
                servers={config.servers}
                relayUrl={config.relayUrl}
                features={config.features ?? {}}
                {visionOptions}
                targetElement={_targetElement}
                onInserted={handleInserted}
                onDelete={handleDelete}
                onRefresh={loadGalleryIfNeeded}
                onEditMetadata={config.features?.metadata !== false ? handleEditMetadata : undefined}
              />
            {:else if tab.custom}
              <div
                bind:this={customContainers[tab.id]}
                class="bm-custom-tab"
              ></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</dialog>

<style>
  /* Note: these styles are scoped to the component.
     The widget host injects a full reset + this compiled CSS into the Shadow DOM. */

  /* ── Design tokens ── */
  .bm-dialog {
    --bm-bg: #ffffff;
    --bm-bg-subtle: #f8f8f8;
    --bm-bg-muted: #f0f0f0;
    --bm-bg-hover: #f5f5f5;
    --bm-text: #222222;
    --bm-text-muted: #777777;
    --bm-text-subtle: #888888;
    --bm-border: #e8e8e8;
    --bm-border-muted: #eee;
    --bm-accent: #6c63ff;
    --bm-accent-hover: #5a52d5;
    --bm-accent-bg: #c5c2ff;
    --bm-accent-bg-subtle: #f0eeff;
    --bm-danger: #c0392b;
    --bm-danger-bg: #fdf0ee;
    --bm-danger-border: #f0c8c2;
    --bm-input-bg: #ffffff;
    --bm-input-border: #ccc;
    --bm-shadow: 0 8px 40px rgba(0, 0, 0, 0.22);
    --bm-backdrop: rgba(0, 0, 0, 0.45);
    --bm-dropzone-bg: #faf9ff;
    --bm-dropzone-border: #c0bfff;
  }

  @media (prefers-color-scheme: dark) {
    .bm-dialog {
      --bm-bg: #1e1e2e;
      --bm-bg-subtle: #2a2a3c;
      --bm-bg-muted: #333348;
      --bm-bg-hover: #3a3a50;
      --bm-text: #e0e0e6;
      --bm-text-muted: #9999aa;
      --bm-text-subtle: #888899;
      --bm-border: #3a3a50;
      --bm-border-muted: #333348;
      --bm-accent: #8b83ff;
      --bm-accent-hover: #7a72ee;
      --bm-accent-bg: rgba(139, 131, 255, 0.3);
      --bm-accent-bg-subtle: rgba(139, 131, 255, 0.1);
      --bm-danger: #e74c3c;
      --bm-danger-bg: rgba(231, 76, 60, 0.15);
      --bm-danger-border: rgba(231, 76, 60, 0.3);
      --bm-input-bg: #2a2a3c;
      --bm-input-border: #4a4a5e;
      --bm-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
      --bm-backdrop: rgba(0, 0, 0, 0.65);
      --bm-dropzone-bg: rgba(139, 131, 255, 0.06);
      --bm-dropzone-border: rgba(139, 131, 255, 0.35);
    }
  }

  .bm-dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    padding: 0;
    border: none;
    border-radius: 12px;
    box-shadow: var(--bm-shadow);
    width: min(95vw, 1200px);
    height: min(95vh, 900px);
    background: var(--bm-bg);
    color: var(--bm-text);
    overflow: hidden;
  }

  .bm-dialog[open] {
    display: flex;
    flex-direction: column;
  }

  .bm-dialog::backdrop {
    background: var(--bm-backdrop);
    backdrop-filter: blur(2px);
  }

  .bm-dialog-inner {
    display: grid;
    grid-template-rows: auto auto 1fr;
    height: 100%;
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    color: var(--bm-text);
  }

  /* ── Header ── */
  .bm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--bm-border);
  }

  .bm-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .bm-close {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--bm-text-subtle);
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    line-height: 1;
  }

  .bm-close:hover {
    background: var(--bm-bg-hover);
    color: var(--bm-text);
  }

  /* ── Tabs ── */
  .bm-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--bm-border);
    padding: 0 0.75rem;
  }

  .bm-tab {
    font: inherit;
    font-size: 0.875rem;
    padding: 0.6rem 1rem;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    color: var(--bm-text-muted);
    position: relative;
    top: 1px;
    transition: color 0.15s, border-color 0.15s;
  }

  .bm-tab.active {
    color: var(--bm-accent);
    border-bottom-color: var(--bm-accent);
    font-weight: 600;
  }

  .bm-tab:hover:not(.active) {
    color: var(--bm-text);
  }

  /* ── Content ── */
  .bm-content {
    overflow: hidden;
    display: grid;
    min-height: 0;
  }

  .bm-tabs-content {
    display: grid;
    overflow: hidden;
    min-height: 0;
  }

  .bm-tabs-content[hidden] {
    display: none;
  }

  .bm-tab-panel {
    overflow: hidden;
    display: none;
    min-height: 0;
  }

  .bm-tab-panel.active,
  .bm-tab-panel:not([hidden]) {
    display: grid;
    overflow: hidden;
  }

  .bm-custom-tab {
    overflow: auto;
    padding: 0.75rem;
  }

  /* ── Edit metadata overlay ── */
  .bm-edit-overlay {
    display: grid;
    gap: 0.5rem;
    padding: 0.5rem;
    overflow-y: auto;
  }

  .edit-overlay-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--bm-text-muted);
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--bm-border-muted);
  }

  .btn-back {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.3rem 0.6rem;
    background: var(--bm-bg-muted);
    border: 1px solid var(--bm-input-border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--bm-text);
  }

  .btn-back:hover {
    background: var(--bm-bg-hover);
  }
</style>
