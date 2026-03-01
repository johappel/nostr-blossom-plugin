<!--
  OerSharesTab — Tab showing the user's AMB/Edufeed shares

  Two views:
  1. List view: Grid of shared OER resources
  2. Detail view: Full AMB metadata with prefLabels

  Includes a settings section for vocabulary URL overrides.

  Props:
    ctx — WidgetContext from the media widget
-->
<script lang="ts">
  import type { WidgetContext, MediaDisplayItem } from '@blossom/plugin/plugin';
  import { iconSchool, iconTune, MediaCard, MediaDetailSheet, MediaGridSearchBar, MediaToolbar } from '@blossom/plugin/plugin';
  import { untrack } from 'svelte';
  import { fetchUserAmbShares } from './nostr/fetch-shares';
  import { publishAmbShareDeletion } from './nostr/delete';
  import type { AmbShareItem, SkosSelection } from './nostr/types';
  import { loadConfig, saveConfig, type OerSharesConfig } from './config';
  import OerShareForm from './OerShareForm.svelte';

  let { ctx }: { ctx: WidgetContext } = $props();

  // ── State ──
  let shares = $state<AmbShareItem[]>([]);
  let filterQuery = $state('');
  let loading = $state(false);
  let deletingShare = $state(false);
  let error = $state<string | null>(null);
  let selectedItem = $state<AmbShareItem | null>(null);
  let showSettings = $state(false);

  // ── Config (persisted) ──
  let config = $state<OerSharesConfig>(loadConfig());

  // ── Edit mode ──
  let editingItem = $state<AmbShareItem | null>(null);

  function startEdit(item: AmbShareItem) {
    editingItem = item;
  }

  function closeEdit() {
    editingItem = null;
  }

  function handleEditSaved() {
    editingItem = null;
    // Reload shares to reflect changes
    loadShares();
  }

  // ── Load shares ──
  async function loadShares() {
    const signer = ctx.signer;
    if (!signer) {
      error = 'Bitte zuerst anmelden, um deine OER-Shares zu sehen.';
      return;
    }

    loading = true;
    error = null;
    selectedItem = null;

    try {
      const pubkey = await signer.getPublicKey();
      shares = await fetchUserAmbShares(pubkey, config.ambRelayUrl);

      if (shares.length === 0) {
        error = 'Noch keine OER-Shares. Teile Medien aus der Mediathek über "Im Edufeed teilen".';
      }
    } catch (err) {
      error = `Fehler beim Laden: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      loading = false;
    }
  }

  // Initial load on mount or signer change
  $effect(() => {
    if (ctx.signer) {
      loadShares();
    } else {
      shares = [];
      error = 'Bitte zuerst anmelden, um deine OER-Shares zu sehen.';
    }
  });

  function selectItem(item: AmbShareItem) {
    selectedItem = item;
  }

  function backToList() {
    selectedItem = null;
  }

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function shortenPubkey(pk: string): string {
    if (!pk || pk.length < 16) return pk;
    return `${pk.slice(0, 8)}…${pk.slice(-4)}`;
  }

  function getDisplayAuthor(item: AmbShareItem): string | undefined {
    const creator = item.creatorName?.trim();
    if (creator) return creator;
    return item.pubkey ? shortenPubkey(item.pubkey) : undefined;
  }

  function getAltText(item: AmbShareItem): string | undefined {
    return item.name?.trim() || undefined;
  }

  function formatConcepts(concepts: SkosSelection[]): string {
    return concepts.map((c) => c.prefLabel).join(', ') || '—';
  }

  // ── Settings (captured once from config — user edits these fields) ──
  const _initConfig = untrack(() => config);
  let settingsAbout = $state(_initConfig.vocabUrls.about ?? '');
  let settingsAudience = $state(_initConfig.vocabUrls.audience ?? '');
  let settingsEduLevel = $state(_initConfig.vocabUrls.educationalLevel ?? '');
  let settingsLrt = $state(_initConfig.vocabUrls.learningResourceType ?? '');
  let settingsRelay = $state(_initConfig.ambRelayUrl);

  function saveSettings() {
    config = {
      ambRelayUrl: settingsRelay.trim(),
      vocabUrls: {
        about: settingsAbout.trim(),
        audience: settingsAudience.trim(),
        educationalLevel: settingsEduLevel.trim(),
        learningResourceType: settingsLrt.trim(),
      },
    };
    saveConfig(config);
    showSettings = false;
  }

  function handleInsert(item: AmbShareItem) {
    if (!item.encodingUrl) return;
    ctx.insert({
      url: item.encodingUrl,
      thumbnailUrl: item.imageUrl,
      description: item.description,
      alt: item.name,
      tags: [],
    });
  }

  async function deleteSelectedShare() {
    if (deletingShare || !selectedItem) return;

    const signer = ctx.signer;
    if (!signer) {
      error = 'Bitte zuerst anmelden, um OER-Shares zu löschen.';
      return;
    }

    const confirmed = confirm('Diesen OER-Share wirklich löschen?');
    if (!confirmed) return;

    deletingShare = true;
    try {
      await publishAmbShareDeletion(
        signer,
        selectedItem.eventId,
        config.ambRelayUrl,
      );
      selectedItem = null;
      await loadShares();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error = `Fehler beim Löschen des OER-Shares: ${e.message}`;
      ctx.reportError(e);
    } finally {
      deletingShare = false;
    }
  }

  /** Convert AmbShareItem → unified MediaDisplayItem for shared grid/sheet components. */
  function toDisplayItem(item: AmbShareItem): MediaDisplayItem {
    if (!item.encodingUrl) {
      return {
        id: item.eventId,
        url: '',
        thumbnailUrl: item.imageUrl,
        name: item.name || 'Unbenannt',
        date: formatDate(item.createdAt),
        tags: [],
      };
    }
    return {
      id: item.eventId,
      url: item.encodingUrl,
      thumbnailUrl: item.imageUrl,
      previewUrl: item.imageUrl,
      name: item.name || 'Unbenannt',
      description: item.description,
      author: getDisplayAuthor(item),
      license: item.licenseId,
      mimeType: undefined,
      date: formatDate(item.createdAt),
      keywords: item.keywords.length ? item.keywords : undefined,
      tags: [],
    };
  }

  const filteredShares = $derived.by(() => {
    const query = filterQuery.trim().toLowerCase();
    if (!query) return shares;

    const terms = query.split(/[,\s]+/).filter(Boolean);

    return shares.filter((item) => {
      const haystack = [
        item.name,
        item.description,
        item.encodingUrl,
        item.imageUrl,
        item.licenseId,
        item.creatorName,
        item.pubkey,
        item.keywords.join(' '),
        item.about.map((x) => x.prefLabel).join(' '),
        item.audience.map((x) => x.prefLabel).join(' '),
        item.educationalLevel.map((x) => x.prefLabel).join(' '),
        item.learningResourceType.map((x) => x.prefLabel).join(' '),
        item.inLanguage,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return terms.every((term) => haystack.includes(term));
    });
  });
</script>

<div class="oer-tab">
  <!-- Toolbar -->
  <div class="oer-toolbar">
    <span class="oer-tab-title">{@html iconSchool(16, 'vertical-align: -2px; margin-right: 4px;')} Meine OER-Shares</span>
    <div class="oer-toolbar-actions">
      <button
        type="button"
        class="oer-icon-btn"
        onclick={() => (showSettings = !showSettings)}
        title="Einstellungen"
      >
        {@html iconTune(18)}
      </button>
    </div>
  </div>

  <!-- Settings Panel -->
  {#if showSettings}
    <div class="oer-settings">
      <div class="oer-settings-title">Einstellungen</div>

      <label class="oer-field">
        <span class="oer-label">AMB Relay</span>
        <input type="text" class="oer-input" bind:value={settingsRelay} />
      </label>

      <label class="oer-field">
        <span class="oer-label">Fächer-Vocabulary (about)</span>
        <input type="text" class="oer-input" bind:value={settingsAbout} />
      </label>

      <label class="oer-field">
        <span class="oer-label">Zielgruppe-Vocabulary (audience)</span>
        <input type="text" class="oer-input" bind:value={settingsAudience} />
      </label>

      <label class="oer-field">
        <span class="oer-label">Bildungsstufe-Vocabulary</span>
        <input type="text" class="oer-input" bind:value={settingsEduLevel} />
      </label>

      <label class="oer-field">
        <span class="oer-label">Ressourcentyp-Vocabulary</span>
        <input type="text" class="oer-input" bind:value={settingsLrt} />
      </label>

      <div class="oer-settings-actions">
        <button type="button" class="oer-btn-cancel" onclick={() => (showSettings = false)}>
          Abbrechen
        </button>
        <button type="button" class="oer-btn-submit" onclick={saveSettings}>
          Speichern
        </button>
      </div>
    </div>
  {/if}

  <!-- Main content -->
  {#if loading}
    <div class="oer-center">
      <span class="oer-spinner"></span>
      <span>Lade OER-Shares…</span>
    </div>
  {:else if error && shares.length === 0}
    <div class="oer-center oer-muted">{error}</div>
  {:else}
    <MediaGridSearchBar
      bind:value={filterQuery}
      placeholder="Suchen: Schlagwort, Beschreibung, Autor, Fach…"
      loading={loading}
      onRefresh={loadShares}
      refreshTitle="OER-Shares neu laden"
    />

    <!-- Grid + detail overlay -->
    <div class="oer-grid-wrapper">
      {#if filteredShares.length === 0}
        <div class="oer-center oer-muted">Keine Treffer für die Suche.</div>
      {:else}
        <div class="oer-grid">
          {#each filteredShares as item (item.eventId)}
            <MediaCard
              item={toDisplayItem(item)}
              selected={selectedItem?.eventId === item.eventId}
              onclick={() => { selectedItem = selectedItem?.eventId === item.eventId ? null : item; }}
            />
          {/each}
        </div>
      {/if}

      <!-- Detail sheet (overlay) -->
      <MediaDetailSheet
        open={!!selectedItem}
        onClose={() => { selectedItem = null; }}
      >
        {#snippet children()}
          {#if selectedItem}
            {#if selectedItem.imageUrl}
              <img class="sidebar-preview" src={selectedItem.imageUrl} alt="" />
            {/if}

            <!-- Base metadata -->
            <dl class="meta-list">
              {#if getAltText(selectedItem)}
                <dt>Alt-Text</dt>
                <dd>{getAltText(selectedItem)}</dd>
              {/if}
              {#if selectedItem.description}
                <dt>Beschreibung</dt>
                <dd>{selectedItem.description}</dd>
              {/if}
              {#if getDisplayAuthor(selectedItem)}
                <dt>Autor</dt>
                <dd>{getDisplayAuthor(selectedItem)}</dd>
              {/if}
              {#if selectedItem.licenseId}
                <dt>Lizenz</dt>
                <dd>{selectedItem.licenseId}</dd>
              {/if}
              {#if selectedItem.keywords.length}
                <dt>Schlagworte</dt>
                <dd>{selectedItem.keywords.join(', ')}</dd>
              {/if}
              <dt>Geteilt am</dt>
              <dd>{formatDate(selectedItem.createdAt)}</dd>
              {#if selectedItem.encodingUrl}
                <dt>URL</dt>
                <dd>
                  <a class="meta-url" href={selectedItem.encodingUrl} target="_blank" rel="noopener">
                    {selectedItem.encodingUrl}
                  </a>
                </dd>
              {/if}
            </dl>

            <!-- Expandable SKOS section -->
            {#if selectedItem.audience.length || selectedItem.educationalLevel.length || selectedItem.learningResourceType.length || selectedItem.about.length || selectedItem.inLanguage}
              <details class="oer-skos-section">
                <summary>Pädagogische Metadaten</summary>
                <dl class="meta-list">
                  {#if selectedItem.inLanguage}
                    <dt>Sprache</dt>
                    <dd>{selectedItem.inLanguage}</dd>
                  {/if}
                  {#if selectedItem.audience.length}
                    <dt>Zielgruppe</dt>
                    <dd>{formatConcepts(selectedItem.audience)}</dd>
                  {/if}
                  {#if selectedItem.educationalLevel.length}
                    <dt>Bildungsstufe</dt>
                    <dd>{formatConcepts(selectedItem.educationalLevel)}</dd>
                  {/if}
                  {#if selectedItem.learningResourceType.length}
                    <dt>Ressourcentyp</dt>
                    <dd>{formatConcepts(selectedItem.learningResourceType)}</dd>
                  {/if}
                  {#if selectedItem.about.length}
                    <dt>Fach / Thema</dt>
                    <dd>{formatConcepts(selectedItem.about)}</dd>
                  {/if}
                  <dt>Kostenlos zugänglich</dt>
                  <dd>{selectedItem.isAccessibleForFree ? 'Ja' : 'Nein'}</dd>
                </dl>
              </details>
            {/if}
          {/if}
        {/snippet}

        {#snippet toolbar()}
          {#if selectedItem && selectedItem.encodingUrl}
            <MediaToolbar
              item={toDisplayItem(selectedItem)}
              insertModes={['url', 'markdown', 'markdown-desc']}
              shareTargets={[]}
              nip94Event={null}
              widgetContext={ctx}
              onInsert={(result) => { ctx.insert(result); selectedItem = null; }}
              deleting={deletingShare}
              onDelete={() => { void deleteSelectedShare(); }}
              onEdit={() => startEdit(selectedItem!)}
            />
          {/if}
        {/snippet}
      </MediaDetailSheet>
    </div>
  {/if}

  <!-- Edit overlay (shown above everything) -->
  {#if editingItem}
    <OerShareForm
      editItem={editingItem}
      {ctx}
      onclose={closeEdit}
      onsaved={handleEditSaved}
      relayUrl={config.ambRelayUrl}
      vocabUrls={config.vocabUrls}
    />
  {/if}
</div>

<style>
  .oer-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Toolbar ── */
  .oer-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.8rem;
    border-bottom: 1px solid var(--bm-input-border, #eee);
    flex-shrink: 0;
  }

  .oer-tab-title {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--bm-text, #222);
  }

  .oer-toolbar-actions {
    display: flex;
    gap: 0.3rem;
  }

  .oer-icon-btn {
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.2rem 0.3rem;
    border-radius: 4px;
    opacity: 0.7;
    display: inline-flex;
    align-items: center;
    color: var(--bm-text, #222);
  }
  .oer-icon-btn:hover { opacity: 1; }
  .oer-icon-btn:disabled { opacity: 0.4; cursor: default; }

  /* ── Center messages ── */
  .oer-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    flex: 1;
    padding: 2rem;
    font-size: 0.85rem;
    color: var(--bm-text, #222);
  }

  .oer-muted {
    color: var(--bm-text-muted, #888);
    text-align: center;
  }

  .oer-spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid var(--bm-input-border, #ccc);
    border-top-color: var(--bm-accent, #6c63ff);
    border-radius: 50%;
    animation: oer-spin 0.8s linear infinite;
  }

  @keyframes oer-spin {
    to { transform: rotate(360deg); }
  }

  /* ── Grid wrapper + grid ── */
  .oer-grid-wrapper {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .oer-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 140px));
    gap: 0.5rem;
    padding: 0.6rem;
    align-content: start;
    align-items: start;
    justify-content: start;
    overflow-y: auto;
    height: 100%;
    box-sizing: border-box;
  }

  /* ── Detail sheet content ── */
  .sidebar-preview {
    width: 100%;
    max-height: 240px;
    object-fit: contain;
    border-radius: 8px;
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
    color: var(--bm-text-muted, #666);
    white-space: nowrap;
    align-self: start;
    padding-top: 2px;
  }

  .meta-list dd {
    margin: 0;
    color: var(--bm-text, #222);
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

  .oer-skos-section {
    margin-top: 0.5rem;
  }

  .oer-skos-section > summary {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--bm-text-muted, #777);
    cursor: pointer;
    padding: 0.3rem 0;
    user-select: none;
  }

  .oer-skos-section[open] > summary {
    margin-bottom: 0.4rem;
  }

  /* ── Settings ── */
  .oer-settings {
    padding: 0.8rem;
    background: var(--bm-bg-subtle, #f8f8f8);
    border-bottom: 1px solid var(--bm-input-border, #eee);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .oer-settings-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--bm-text, #222);
  }

  .oer-settings-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.3rem;
  }

  /* ── Shared form styles (also used in settings) ── */
  .oer-field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .oer-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--bm-text-muted, #666);
  }

  .oer-input {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 5px;
    background: var(--bm-input-bg, #fff);
    color: var(--bm-text, #222);
    width: 100%;
    box-sizing: border-box;
  }

  .oer-btn-cancel,
  .oer-btn-submit {
    font: inherit;
    font-size: 0.78rem;
    padding: 0.35rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    border: none;
  }

  .oer-btn-cancel {
    background: var(--bm-bg-subtle, #eee);
    color: var(--bm-text, #222);
  }

  .oer-btn-submit {
    background: var(--bm-accent, #6c63ff);
    color: #fff;
    font-weight: 600;
  }

  .oer-btn-submit:hover {
    background: var(--bm-accent-hover, #5a52d5);
  }
</style>
