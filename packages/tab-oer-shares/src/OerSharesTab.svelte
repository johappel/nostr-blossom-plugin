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
  import type { WidgetContext } from '@blossom/plugin/plugin';
  import { fetchUserAmbShares } from './nostr/fetch-shares';
  import type { AmbShareItem, SkosSelection } from './nostr/types';
  import { loadConfig, saveConfig, type OerSharesConfig } from './config';

  let { ctx }: { ctx: WidgetContext } = $props();

  // ── State ──
  let shares = $state<AmbShareItem[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let selectedItem = $state<AmbShareItem | null>(null);
  let showSettings = $state(false);

  // ── Config (persisted) ──
  let config = $state<OerSharesConfig>(loadConfig());

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

  function formatConcepts(concepts: SkosSelection[]): string {
    return concepts.map((c) => c.prefLabel).join(', ') || '—';
  }

  // ── Settings ──
  let settingsAbout = $state(config.vocabUrls.about ?? '');
  let settingsAudience = $state(config.vocabUrls.audience ?? '');
  let settingsEduLevel = $state(config.vocabUrls.educationalLevel ?? '');
  let settingsLrt = $state(config.vocabUrls.learningResourceType ?? '');
  let settingsRelay = $state(config.ambRelayUrl);

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
      tags: [], // We don't have raw tags in shareItem
    });
  }
</script>

<div class="oer-tab">
  <!-- Toolbar -->
  <div class="oer-toolbar">
    {#if selectedItem}
      <button type="button" class="oer-back-btn" onclick={backToList}>
        ← Zurück
      </button>
    {:else}
      <span class="oer-tab-title">🎓 Meine OER-Shares</span>
    {/if}
    <div class="oer-toolbar-actions">
      {#if !selectedItem}
        <button
          type="button"
          class="oer-icon-btn"
          onclick={() => loadShares()}
          title="Aktualisieren"
          disabled={loading}
        >
          🔄
        </button>
      {/if}
      <button
        type="button"
        class="oer-icon-btn"
        onclick={() => (showSettings = !showSettings)}
        title="Einstellungen"
      >
        ⚙️
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
  {:else if error && !selectedItem && shares.length === 0}
    <div class="oer-center oer-muted">{error}</div>
  {:else if selectedItem}
    <!-- Detail view -->
    <div class="oer-detail">
      {#if selectedItem.imageUrl}
        <img src={selectedItem.imageUrl} alt="" class="oer-detail-image" />
      {/if}

      <dl class="oer-meta-list">
        <dt>Name</dt>
        <dd>{selectedItem.name || '—'}</dd>

        <dt>Beschreibung</dt>
        <dd>{selectedItem.description || '—'}</dd>

        <dt>Schlagworte</dt>
        <dd>{selectedItem.keywords.join(', ') || '—'}</dd>

        <dt>Autor</dt>
        <dd>{selectedItem.creatorName || '(Nostr-Profil)'}</dd>

        <dt>Lizenz</dt>
        <dd>{selectedItem.licenseId || '—'}</dd>

        <dt>Sprache</dt>
        <dd>{selectedItem.inLanguage || '—'}</dd>

        <dt>Zielgruppe</dt>
        <dd>{formatConcepts(selectedItem.audience)}</dd>

        <dt>Bildungsstufe</dt>
        <dd>{formatConcepts(selectedItem.educationalLevel)}</dd>

        <dt>Ressourcentyp</dt>
        <dd>{formatConcepts(selectedItem.learningResourceType)}</dd>

        <dt>Fach / Thema</dt>
        <dd>{formatConcepts(selectedItem.about)}</dd>

        <dt>Kostenlos zugänglich</dt>
        <dd>{selectedItem.isAccessibleForFree ? 'Ja' : 'Nein'}</dd>

        <dt>Geteilt am</dt>
        <dd>{formatDate(selectedItem.createdAt)}</dd>

        {#if selectedItem.encodingUrl}
          <dt>URL</dt>
          <dd class="oer-url-cell">
            <a href={selectedItem.encodingUrl} target="_blank" rel="noopener">
              {selectedItem.encodingUrl}
            </a>
          </dd>
        {/if}
      </dl>

      {#if selectedItem.encodingUrl}
        <button
          type="button"
          class="oer-btn-submit oer-insert-btn"
          onclick={() => handleInsert(selectedItem!)}
        >
          URL übernehmen
        </button>
      {/if}
    </div>
  {:else}
    <!-- Grid view -->
    <div class="oer-grid">
      {#each shares as item (item.eventId)}
        <button type="button" class="oer-card" onclick={() => selectItem(item)}>
          {#if item.imageUrl}
            <img src={item.imageUrl} alt="" class="oer-card-img" />
          {:else}
            <div class="oer-card-placeholder">🎓</div>
          {/if}
          <div class="oer-card-info">
            <span class="oer-card-name">{item.name || 'Unbenannt'}</span>
            <span class="oer-card-date">{formatDate(item.createdAt)}</span>
          </div>
        </button>
      {/each}
    </div>
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

  .oer-back-btn {
    background: none;
    border: none;
    font: inherit;
    font-size: 0.82rem;
    color: var(--bm-accent, #6c63ff);
    cursor: pointer;
    padding: 0.2rem 0;
    font-weight: 600;
  }

  .oer-icon-btn {
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.2rem 0.3rem;
    border-radius: 4px;
    opacity: 0.7;
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

  /* ── Grid ── */
  .oer-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.5rem;
    padding: 0.6rem;
    overflow-y: auto;
    flex: 1;
  }

  .oer-card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--bm-input-border, #ddd);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    background: var(--bm-bg, #fff);
    text-align: left;
    padding: 0;
    font: inherit;
    transition: box-shadow 0.15s;
  }
  .oer-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  .oer-card-img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
  }

  .oer-card-placeholder {
    width: 100%;
    aspect-ratio: 4 / 3;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    background: var(--bm-bg-subtle, #f5f5f5);
  }

  .oer-card-info {
    padding: 0.4rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .oer-card-name {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--bm-text, #222);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .oer-card-date {
    font-size: 0.68rem;
    color: var(--bm-text-muted, #999);
  }

  /* ── Detail ── */
  .oer-detail {
    flex: 1;
    overflow-y: auto;
    padding: 0.8rem;
  }

  .oer-detail-image {
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    border-radius: 8px;
    margin-bottom: 0.8rem;
    background: var(--bm-bg-subtle, #f8f8f8);
  }

  .oer-meta-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.8rem;
    font-size: 0.8rem;
    margin: 0;
  }

  .oer-meta-list dt {
    font-weight: 600;
    color: var(--bm-text-muted, #666);
    white-space: nowrap;
  }

  .oer-meta-list dd {
    margin: 0;
    color: var(--bm-text, #222);
    word-break: break-word;
  }

  .oer-url-cell a {
    color: var(--bm-accent, #6c63ff);
    text-decoration: none;
    font-size: 0.75rem;
  }
  .oer-url-cell a:hover { text-decoration: underline; }

  .oer-insert-btn {
    margin-top: 0.8rem;
    width: 100%;
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
