<script lang="ts">
  import type { WidgetContext, Nip94FileEvent, MediaDisplayItem } from '@blossom/plugin/plugin';
  import { iconSync, MediaCard, MediaDetailSheet, MediaGridSearchBar, MediaToolbar } from '@blossom/plugin/plugin';
  import { fetchMemberships } from './nostr/memberships';
  import { fetchCommunity } from './nostr/community';
  import { fetchCommunityMedia, parseShareEvent } from './nostr/community-media';
  import { publishCommunityShareDeletion } from './nostr/delete';
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
  let deletingShare = $state(false);
  let error = $state('');

  let selectedMediaUrl = $state<string | null>(null);
  let filterQuery = $state('');

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

  function extractAltFromNip94(ev: { tags: string[][] }): string | undefined {
    return ev.tags.find(t => t[0] === 'alt')?.[1] || undefined;
  }

  function extractAuthorFromNip94(ev: { tags: string[][]; pubkey?: string }): string | undefined {
    const authorTag = ev.tags.find(t => t[0] === 'author')?.[1];
    if (authorTag) return authorTag;
    const pTag = ev.tags.find(t => t[0] === 'p')?.[1];
    if (pTag) return shortenPubkey(pTag);
    return ev.pubkey ? shortenPubkey(ev.pubkey) : undefined;
  }

  function extractLicenseFromNip94(ev: { tags: string[][] }): { license?: string; licenseLabel?: string } {
    const licenseTag = ev.tags.find(t => t[0] === 'license');
    if (licenseTag) {
      return {
        license: licenseTag[1] || undefined,
        licenseLabel: licenseTag[2] || undefined,
      };
    }

    const lTag = ev.tags.find(t => t[0] === 'l');
    return {
      license: lTag?.[1] || undefined,
      licenseLabel: lTag?.[2] || undefined,
    };
  }

  function extractKeywordsFromNip94(ev: { tags: string[][] }): string[] {
    return ev.tags.filter(t => t[0] === 't').map(t => t[1]).filter(Boolean);
  }

  function shortenPubkey(pk: string): string {
    if (!pk || pk.length < 16) return pk;
    return `${pk.slice(0, 8)}…${pk.slice(-4)}`;
  }

  /** Convert enriched community media item → unified MediaDisplayItem for shared components. */
  function toDisplayItem(item: typeof enrichedMedia[number]): MediaDisplayItem {
    const nip94 = resolvedNip94.get(item.originalEventId);
    const kws = nip94 ? extractKeywordsFromNip94(nip94) : [];
    const lic = nip94 ? extractLicenseFromNip94(nip94) : {};
    return {
      id: item.url,
      url: item.url,
      thumbnailUrl: item.thumbUrl || (item.mime.startsWith('image/') ? item.url : undefined),
      previewUrl: item.mime.startsWith('image/') ? item.url : undefined,
      name: item.description || '',
      description: item.description,
      author: nip94 ? extractAuthorFromNip94(nip94) : shortenPubkey(item.sharedBy),
      license: lic.license,
      licenseLabel: lic.licenseLabel,
      mimeType: item.mime,
      date: new Date(item.sharedAt * 1000).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      }),
      keywords: kws.length ? kws : undefined,
      tags: nip94?.tags,
      badge: { text: shortenPubkey(item.sharedBy), title: `Geteilt von ${item.sharedBy}` },
    };
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

  let filteredMedia = $derived.by(() => {
    const query = filterQuery.trim().toLowerCase();
    if (!query) return enrichedMedia;

    const terms = query.split(/[,\s]+/).filter(Boolean);

    return enrichedMedia.filter((item) => {
      const nip94 = resolvedNip94.get(item.originalEventId);
      const alt = nip94 ? extractAltFromNip94(nip94) ?? '' : '';
      const author = nip94 ? extractAuthorFromNip94(nip94) ?? '' : '';
      const licenseInfo = nip94 ? extractLicenseFromNip94(nip94) : {};
      const keywords = nip94 ? extractKeywordsFromNip94(nip94) : [];

      const haystack = [
        item.description,
        item.mime,
        item.url,
        item.sharedBy,
        alt,
        author,
        licenseInfo.licenseLabel,
        licenseInfo.license,
        ...keywords,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return terms.every((term) => haystack.includes(term));
    });
  });

  let selectedMedia = $derived(
    selectedMediaUrl ? filteredMedia.find(m => m.url === selectedMediaUrl) ?? null : null,
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

  // ── Initial load on mount ─────────────────────────────────────────────────
  $effect(() => {
    // Load memberships once when signer becomes available
    if (ctx.signer && memberships.length === 0 && !loadingMemberships) {
      loadMemberships();
    }
  });

  async function deleteSelectedShare() {
    if (deletingShare || !selectedMedia) return;

    const signer = ctx.signer;
    if (!signer) {
      error = 'Kein Signer verfügbar. Bitte zuerst anmelden.';
      return;
    }

    const confirmed = confirm('Diesen Community-Share wirklich löschen?');
    if (!confirmed) return;

    const relayUrls = [...new Set([
      ...(selectedCommunity?.relays ?? []),
      ...ctx.relayUrls,
    ])].filter(Boolean);

    deletingShare = true;
    try {
      await publishCommunityShareDeletion(
        signer,
        selectedMedia.shareEventId,
        relayUrls,
      );
      selectedMediaUrl = null;
      await loadCommunityMedia();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error = `Fehler beim Löschen des Community-Shares: ${e.message}`;
      ctx.reportError(e);
    } finally {
      deletingShare = false;
    }
  }
</script>

<div class="community-tab">
  <!-- Community selector -->
  <div class="community-header-row">
    <span class="community-label">Aktuelle Community</span>
    <div class="community-controls">
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
      >{@html iconSync(16)}</button>
    </div>
  </div>

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
      <MediaGridSearchBar
        bind:value={filterQuery}
        placeholder="Suchen: Schlagwort, Beschreibung, Autor, Typ…"
        loading={loadingMedia}
        onRefresh={loadCommunityMedia}
        refreshTitle="Community-Medien neu laden"
      />

      {#if filteredMedia.length === 0}
        <div class="community-status">
          Keine Treffer für die Suche.
        </div>
      {:else}
        <div class="community-grid-wrapper">
          <!-- Media grid -->
          <div class="media-grid">
            {#each filteredMedia as item (item.shareEventId)}
              <MediaCard
                item={toDisplayItem(item)}
                selected={selectedMediaUrl === item.url}
                onclick={() => { selectedMediaUrl = selectedMediaUrl === item.url ? null : item.url; }}
              />
            {/each}
          </div>

          <!-- Detail sheet (overlay) -->
          <MediaDetailSheet
            open={!!selectedMedia}
            onClose={() => { selectedMediaUrl = null; }}
          >
            {#snippet children()}
              {#if selectedMedia}
                {#if selectedMedia.mime.startsWith('image/')}
                  <img class="sidebar-preview" src={selectedMedia.url} alt={selectedMedia.description} />
                {/if}
                <dl class="meta-list">
                  {#if selectedMedia.description}
                    <dt>Beschreibung</dt>
                    <dd>{selectedMedia.description}</dd>
                  {/if}
                  {#if resolvedNip94.get(selectedMedia.originalEventId)}
                    {@const nip94 = resolvedNip94.get(selectedMedia.originalEventId)!}
                    {@const altText = extractAltFromNip94(nip94)}
                    {#if altText}
                      <dt>Alt-Text</dt>
                      <dd>{altText}</dd>
                    {/if}
                    {@const author = extractAuthorFromNip94(nip94)}
                    {#if author}
                      <dt>Autor</dt>
                      <dd>{author}</dd>
                    {/if}
                    {@const licenseInfo = extractLicenseFromNip94(nip94)}
                    {#if licenseInfo.license || licenseInfo.licenseLabel}
                      <dt>Lizenz</dt>
                      <dd>{licenseInfo.licenseLabel && licenseInfo.license ? `${licenseInfo.licenseLabel} (${licenseInfo.license})` : (licenseInfo.licenseLabel ?? licenseInfo.license)}</dd>
                    {/if}
                    {@const kws = extractKeywordsFromNip94(nip94)}
                    {#if kws.length}
                      <dt>Keywords</dt>
                      <dd>{kws.join(', ')}</dd>
                    {/if}
                  {/if}
                  <dt>Geteilt von</dt>
                  <dd>{shortenPubkey(selectedMedia.sharedBy)}</dd>
                  <dt>Typ</dt>
                  <dd>{selectedMedia.mime || 'Unbekannt'}</dd>
                  <dt>Datum</dt>
                  <dd>{new Date(selectedMedia.sharedAt * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd>
                  <dt>URL</dt>
                  <dd><a class="meta-url" href={selectedMedia.url} target="_blank" rel="noopener">{selectedMedia.url}</a></dd>
                </dl>
              {/if}
            {/snippet}

            {#snippet toolbar()}
              {#if selectedMedia}
                <MediaToolbar
                  item={toDisplayItem(selectedMedia)}
                  insertModes={['url', 'markdown', 'markdown-desc']}
                  shareTargets={[]}
                  widgetContext={ctx}
                  onInsert={(result) => { ctx.insert(result); selectedMediaUrl = null; }}
                  deleting={deletingShare}
                  onDelete={() => { void deleteSelectedShare(); }}
                  onEdit={null}
                />
              {/if}
            {/snippet}
          </MediaDetailSheet>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .community-tab {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    height: 100%;
    overflow: hidden;
    padding: 0.6rem;
    box-sizing: border-box;
  }

  .community-header-row {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }

  .community-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--bm-text-muted, #888);
    white-space: nowrap;
  }

  .community-controls {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .community-select {
    flex: 1;
    min-width: 0;
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
    display: inline-flex;
    align-items: center;
  }
  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .community-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
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
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .media-grid {
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
    width: 100%;
    max-height: 240px;
    object-fit: contain;
    border-radius: 6px;
    background: var(--bm-bg-subtle, #f8f8f8);
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
  }

  .meta-url {
    color: var(--bm-accent, #6c63ff);
    text-decoration: none;
    font-size: 0.75rem;
    word-break: break-all;
  }

  .meta-url:hover {
    text-decoration: underline;
  }

  /* ── Responsive: stack layout on small widths ── */
  @container (max-width: 500px) {
    .community-grid-wrapper {
      flex-direction: column;
    }
  }
</style>
