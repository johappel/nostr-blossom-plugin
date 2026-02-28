<script lang="ts">
  import type { WidgetContext, Nip94FileEvent } from '@blossom/plugin/plugin';
  import { fetchMemberships } from './nostr/memberships';
  import { fetchCommunity } from './nostr/community';
  import { fetchCommunityMedia, parseShareEvent } from './nostr/community-media';
  import type { CommunityInfo, CommunityMembership, CommunityMediaItem } from './nostr/types';

  interface CommunityTabProps {
    ctx: WidgetContext;
  }

  let { ctx }: CommunityTabProps = $props();

  // ── State ──────────────────────────────────────────────────────────────────
  let memberships = $state<CommunityMembership[]>([]);
  let communities = $state<Map<string, CommunityInfo>>(new Map());
  let selectedCommunityPubkey = $state<string | null>(null);

  let mediaItems = $state<CommunityMediaItem[]>([]);
  let resolvedNip94 = $state<Map<string, {
    id: string; pubkey: string; created_at: number; tags: string[][]; content: string;
  }>>(new Map());

  let loadingMemberships = $state(false);
  let loadingMedia = $state(false);
  let error = $state('');

  let selectedMediaUrl = $state<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'communikey-last-community';

  function getLastCommunity(): string | null {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }
  function setLastCommunity(pubkey: string) {
    try { localStorage.setItem(STORAGE_KEY, pubkey); } catch { /* noop */ }
  }

  function extractUrlFromNip94(ev: { tags: string[][] }): string | null {
    const urlTag = ev.tags.find(t => t[0] === 'url');
    return urlTag?.[1] ?? null;
  }

  function extractThumbFromNip94(ev: { tags: string[][] }): string | null {
    const thumbTag = ev.tags.find(t => t[0] === 'thumb');
    return thumbTag?.[1] ?? null;
  }

  function extractMimeFromNip94(ev: { tags: string[][] }): string {
    const mTag = ev.tags.find(t => t[0] === 'm');
    return mTag?.[1] ?? '';
  }

  function extractDescriptionFromNip94(ev: { tags: string[][] ; content: string }): string {
    const altTag = ev.tags.find(t => t[0] === 'alt');
    return ev.content || altTag?.[1] || '';
  }

  function shortenPubkey(pk: string): string {
    if (!pk || pk.length < 16) return pk;
    return `${pk.slice(0, 8)}…${pk.slice(-4)}`;
  }

  // ── Selected community info ────────────────────────────────────────────────
  let selectedCommunity = $derived(
    selectedCommunityPubkey ? communities.get(selectedCommunityPubkey) ?? null : null,
  );

  // ── Media with URL info ────────────────────────────────────────────────────
  let enrichedMedia = $derived.by(() => {
    return mediaItems
      .map(item => {
        const ev = resolvedNip94.get(item.originalEventId);
        if (!ev) return null;
        const url = extractUrlFromNip94(ev);
        if (!url) return null;
        return {
          ...item,
          url,
          thumbUrl: extractThumbFromNip94(ev) ?? url,
          mime: extractMimeFromNip94(ev),
          description: extractDescriptionFromNip94(ev),
          authorPubkey: ev.pubkey,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  });

  let selectedMedia = $derived(
    selectedMediaUrl ? enrichedMedia.find(m => m.url === selectedMediaUrl) ?? null : null,
  );

  // ── Load memberships ──────────────────────────────────────────────────────
  async function loadMemberships() {
    const signer = ctx.signer;
    if (!signer) {
      error = 'Kein Signer verfügbar. Bitte zuerst anmelden.';
      return;
    }

    loadingMemberships = true;
    error = '';

    try {
      const pubkey = await signer.getPublicKey();
      memberships = await fetchMemberships(pubkey, ctx.relayUrls);

      if (memberships.length === 0) {
        error = 'Keine Communities gefunden. Tritt zuerst einer Community bei.';
        return;
      }

      // Resolve community profiles
      const newCommunities = new Map(communities);
      await Promise.all(
        memberships.map(async (m) => {
          if (newCommunities.has(m.communityPubkey)) return;
          const relays = m.relayHint
            ? [...ctx.relayUrls, m.relayHint]
            : ctx.relayUrls;
          const info = await fetchCommunity(m.communityPubkey, relays);
          if (info) newCommunities.set(m.communityPubkey, info);
        }),
      );
      communities = newCommunities;

      // Auto-select: last used or first
      const last = getLastCommunity();
      if (last && newCommunities.has(last)) {
        selectedCommunityPubkey = last;
      } else if (memberships.length > 0) {
        selectedCommunityPubkey = memberships[0].communityPubkey;
      }
    } catch (err) {
      error = `Fehler beim Laden der Communities: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      loadingMemberships = false;
    }
  }

  // ── Load community media ──────────────────────────────────────────────────
  async function loadCommunityMedia() {
    if (!selectedCommunityPubkey) return;
    const info = communities.get(selectedCommunityPubkey);
    if (!info) return;

    loadingMedia = true;
    selectedMediaUrl = null;

    try {
      const result = await fetchCommunityMedia(
        selectedCommunityPubkey,
        info.relays,
        ctx.relayUrls,
      );
      mediaItems = result.shares;
      resolvedNip94 = result.resolvedEvents;
    } catch (err) {
      error = `Fehler beim Laden der Community-Medien: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      loadingMedia = false;
    }
  }

  // ── Reactive: reload media when community changes ─────────────────────────
  $effect(() => {
    if (selectedCommunityPubkey) {
      setLastCommunity(selectedCommunityPubkey);
      loadCommunityMedia();
    }
  });

  // ── Handle "Übernehmen" ───────────────────────────────────────────────────
  function handleInsert() {
    if (!selectedMedia) return;
    ctx.insert({
      url: selectedMedia.url,
      mimeType: selectedMedia.mime,
      description: selectedMedia.description,
      tags: [],
    });
  }

  // ── Initial load on mount ─────────────────────────────────────────────────
  $effect(() => {
    // Load memberships once when signer becomes available
    if (ctx.signer && memberships.length === 0 && !loadingMemberships) {
      loadMemberships();
    }
  });
</script>

<div class="community-tab">
  <!-- Community selector -->
  <div class="community-toolbar">
    {#if memberships.length > 0}
      <select
        class="community-select"
        bind:value={selectedCommunityPubkey}
      >
        {#each memberships as m (m.communityPubkey)}
          {@const info = communities.get(m.communityPubkey)}
          <option value={m.communityPubkey}>
            {info?.name ?? shortenPubkey(m.communityPubkey)}
          </option>
        {/each}
      </select>
    {/if}
    <button
      type="button"
      class="btn-refresh"
      disabled={loadingMemberships || loadingMedia}
      onclick={loadMemberships}
      title="Communities neu laden"
    >🔄</button>
  </div>

  <!-- Community info bar -->
  {#if selectedCommunity}
    <div class="community-info">
      {#if selectedCommunity.picture}
        <img class="community-avatar" src={selectedCommunity.picture} alt="" />
      {:else}
        <span class="community-avatar community-avatar--placeholder">👥</span>
      {/if}
      <div class="community-details">
        <span class="community-name">{selectedCommunity.name ?? shortenPubkey(selectedCommunityPubkey ?? '')}</span>
        <span class="community-meta">
          {selectedCommunity.relays.length} Relay{selectedCommunity.relays.length !== 1 ? 's' : ''} · {enrichedMedia.length} Medien
        </span>
      </div>
    </div>
  {/if}

  <!-- Content area -->
  <div class="community-content">
    {#if loadingMemberships}
      <div class="community-status">
        <span class="spinner">⏳</span> Communities werden geladen…
      </div>
    {:else if loadingMedia}
      <div class="community-status">
        <span class="spinner">⏳</span> Medien werden geladen…
      </div>
    {:else if error}
      <div class="community-error">{error}</div>
    {:else if !ctx.signer}
      <div class="community-status">
        Bitte melde dich an, um Communities zu sehen.
      </div>
    {:else if enrichedMedia.length === 0 && selectedCommunityPubkey}
      <div class="community-status">
        Noch keine Medien in dieser Community geteilt.
      </div>
    {:else}
      <div class="community-grid-wrapper">
        <!-- Media grid -->
        <div class="media-grid">
          {#each enrichedMedia as item (item.shareEventId)}
            {@const isImage = item.mime.startsWith('image/')}
            <button
              type="button"
              class="thumb-btn"
              class:selected={selectedMediaUrl === item.url}
              onclick={() => { selectedMediaUrl = selectedMediaUrl === item.url ? null : item.url; }}
              title={item.description || item.url}
            >
              {#if isImage}
                <img
                  src={item.thumbUrl}
                  alt={item.description}
                  class="thumb-img"
                  loading="lazy"
                />
              {:else}
                <div class="thumb-file">
                  <span class="thumb-file-icon">📄</span>
                  <span class="thumb-file-mime">{item.mime || '?'}</span>
                </div>
              {/if}
              <span class="shared-by-badge" title="Geteilt von {shortenPubkey(item.sharedBy)}">
                {shortenPubkey(item.sharedBy)}
              </span>
            </button>
          {/each}
        </div>

        <!-- Sidebar for selected item -->
        {#if selectedMedia}
          <div class="sidebar-panel">
            <div class="sidebar-scroll">
              {#if selectedMedia.mime.startsWith('image/')}
                <img class="sidebar-preview" src={selectedMedia.url} alt={selectedMedia.description} />
              {/if}

              <div class="sidebar-meta">
                {#if selectedMedia.description}
                  <div class="meta-row">
                    <span class="meta-label">Beschreibung</span>
                    <span class="meta-value">{selectedMedia.description}</span>
                  </div>
                {/if}
                <div class="meta-row">
                  <span class="meta-label">Typ</span>
                  <span class="meta-value">{selectedMedia.mime || 'Unbekannt'}</span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Geteilt von</span>
                  <span class="meta-value">{shortenPubkey(selectedMedia.sharedBy)}</span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Datum</span>
                  <span class="meta-value">{new Date(selectedMedia.sharedAt * 1000).toLocaleDateString()}</span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">URL</span>
                  <a class="meta-link" href={selectedMedia.url} target="_blank" rel="noopener">{selectedMedia.url}</a>
                </div>
              </div>
            </div>

            <div class="sidebar-toolbar">
              <button type="button" class="btn-primary" onclick={handleInsert}>
                ✓ Übernehmen
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .community-tab {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: 100%;
    overflow: hidden;
    padding: 0.5rem;
    box-sizing: border-box;
  }

  .community-toolbar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .community-select {
    flex: 1;
    font: inherit;
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 4px;
    background: var(--bm-input-bg, #fff);
    color: var(--bm-text, #222);
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

  .community-info {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.5rem;
    background: var(--bm-bg-subtle, #f8f8f8);
    border-radius: 6px;
    border: 1px solid var(--bm-border-muted, #eee);
  }

  .community-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .community-avatar--placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    background: var(--bm-bg-muted, #e8e8e8);
  }

  .community-details {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .community-name {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--bm-text, #222);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-meta {
    font-size: 0.72rem;
    color: var(--bm-text-muted, #888);
  }

  .community-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .community-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    height: 100%;
    color: var(--bm-text-muted, #888);
    font-size: 0.85rem;
  }

  .community-error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--bm-danger, #d63031);
    font-size: 0.85rem;
    text-align: center;
    padding: 1rem;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .community-grid-wrapper {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .media-grid {
    flex: 1;
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
    border: 2px solid transparent;
    border-radius: 6px;
    padding: 0;
    background: var(--bm-bg-subtle, #f5f5f5);
    cursor: pointer;
    overflow: hidden;
    transition: border-color 0.12s;
  }
  .thumb-btn:hover {
    border-color: var(--bm-accent, #6c63ff);
  }
  .thumb-btn.selected {
    border-color: var(--bm-accent, #6c63ff);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--bm-accent, #6c63ff) 30%, transparent);
  }

  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumb-file {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.2rem;
  }
  .thumb-file-icon { font-size: 1.5rem; }
  .thumb-file-mime {
    font-size: 0.6rem;
    color: var(--bm-text-muted, #888);
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    padding: 0 2px;
  }

  .shared-by-badge {
    position: absolute;
    bottom: 2px;
    left: 2px;
    right: 2px;
    background: rgba(0,0,0,0.6);
    color: #fff;
    font-size: 0.55rem;
    padding: 1px 3px;
    border-radius: 3px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-panel {
    width: 280px;
    flex-shrink: 0;
    border-left: 1px solid var(--bm-border-muted, #eee);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .sidebar-preview {
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    border-radius: 6px;
    background: var(--bm-bg-subtle, #f8f8f8);
    margin-bottom: 0.5rem;
  }

  .sidebar-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .meta-row {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .meta-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--bm-text-muted, #888);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .meta-value {
    font-size: 0.82rem;
    color: var(--bm-text, #222);
    word-break: break-word;
  }

  .meta-link {
    font-size: 0.78rem;
    color: var(--bm-accent, #6c63ff);
    text-decoration: none;
    word-break: break-all;
  }
  .meta-link:hover {
    text-decoration: underline;
  }

  .sidebar-toolbar {
    padding: 0.5rem;
    border-top: 1px solid var(--bm-border-muted, #eee);
    display: flex;
    gap: 0.4rem;
  }

  .btn-primary {
    flex: 1;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    background: var(--bm-accent, #6c63ff);
    color: #fff;
    cursor: pointer;
    transition: background 0.12s;
  }
  .btn-primary:hover {
    background: var(--bm-accent-hover, #5a52d5);
  }

  /* ── Responsive: stack layout on small widths ── */
  @container (max-width: 500px) {
    .community-grid-wrapper {
      flex-direction: column;
    }
    .sidebar-panel {
      width: auto;
      border-left: none;
      border-top: 1px solid var(--bm-border-muted, #eee);
      max-height: 50%;
    }
  }
</style>
