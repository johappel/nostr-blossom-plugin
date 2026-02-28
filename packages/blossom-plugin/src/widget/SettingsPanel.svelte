<script lang="ts">
  import { untrack } from 'svelte';
  import type { BlossomSigner } from '../core/types';
  import type { BlossomUserSettings } from '../core/settings';
  import type { NostrProfile } from '../core/profile';
  import type { BunkerStatus, BunkerSession } from '../core/nip46';
  import { fetchProfile, shortenPubkey } from '../core/profile';
  import {
    saveSettingsToLocalStorage,
    publishSettingsEvent,
  } from '../core/settings';
  import { connectBunker, isValidBunkerUri } from '../core/nip46';

  interface SettingsPanelProps {
    /** Current user settings. */
    settings: BlossomUserSettings;
    /** Currently active signer (NIP-07 / NIP-46 / config). */
    signer: BlossomSigner | null;
    /** Relay URLs for NIP-78 sync and profile fetch. */
    relayUrls: string[];
    /** Application ID for localStorage scoping. */
    appId: string;
    /** Called when user clicks "← Zurück". */
    onClose: () => void;
    /** Called with updated settings after save. */
    onSettingsChanged: (settings: BlossomUserSettings) => void;
    /** Whether a bunker session is currently active. */
    bunkerConnected: boolean;
    /** Called when a NIP-46 bunker session has been established. */
    onBunkerConnected: (session: BunkerSession) => void;
    /** Called when user wants to disconnect the bunker. */
    onBunkerDisconnect: () => void;
    /** Registered tab plugins (for enable/disable toggles). */
    registeredPlugins?: { id: string; label: string; icon?: string; defaultDisabled?: boolean }[];
  }

  let {
    settings,
    signer,
    relayUrls,
    appId,
    onClose,
    onSettingsChanged,
    bunkerConnected,
    onBunkerConnected,
    onBunkerDisconnect,
    registeredPlugins = [],
  }: SettingsPanelProps = $props();

  // ── Form state (initialised from current settings snapshot) ──────────
  // We intentionally capture once – the panel is re-created each time it
  // opens, so reactive tracking of the prop is not needed here.
  const _init = untrack(() => settings);
  let bunkerUri = $state(_init.bunkerUri ?? '');
  let serversText = $state((_init.servers ?? []).join('\n'));
  let relaysText = $state((_init.relays ?? []).join('\n'));
  let visionEndpoint = $state(_init.visionEndpoint ?? '');
  // Seed default-disabled plugins the first time the user sees them.
  // If settings already contain an explicit disabledPlugins array the user
  // has saved before, we honour it.  Otherwise we pre-populate with
  // plugins whose `defaultDisabled` flag is true.
  const _savedDisabled = new Set(_init.disabledPlugins ?? []);
  if (!_init.disabledPlugins) {
    for (const p of untrack(() => registeredPlugins)) {
      if (p.defaultDisabled) _savedDisabled.add(p.id);
    }
  }
  let disabledPlugins = $state<Set<string>>(_savedDisabled);

  // ── Bunker connection state ────────────────────────────────────────────
  const _initBunkerConnected = untrack(() => bunkerConnected);
  let bunkerStatus = $state<BunkerStatus>(_initBunkerConnected ? 'connected' : 'idle');
  let bunkerError = $state('');

  // ── Profile state ──────────────────────────────────────────────────────
  let profile = $state<NostrProfile | null>(null);
  let profileLoading = $state(false);

  // ── Save state ─────────────────────────────────────────────────────────
  let saveMessage = $state('');
  let saving = $state(false);

  // ── Load profile when signer is available ──────────────────────────────
  $effect(() => {
    if (!signer || relayUrls.length === 0) {
      profile = null;
      return;
    }
    profileLoading = true;
    signer.getPublicKey().then((pubkey) => {
      fetchProfile(pubkey, relayUrls)
        .then((p) => { profile = p; })
        .catch(() => { profile = null; })
        .finally(() => { profileLoading = false; });
    }).catch(() => { profileLoading = false; });
  });

  // ── Bunker connect ─────────────────────────────────────────────────────
  async function handleBunkerConnect() {
    if (!bunkerUri.trim()) return;
    if (!isValidBunkerUri(bunkerUri.trim())) {
      bunkerError = 'Ungültiges Format. Erwartet: bunker://pubkey?relay=wss://…';
      bunkerStatus = 'error';
      return;
    }
    bunkerError = '';
    try {
      const session = await connectBunker(bunkerUri.trim(), (status, err) => {
        bunkerStatus = status;
        if (err) bunkerError = err;
      });
      onBunkerConnected(session);
    } catch {
      // Status/error already set via callback
    }
  }

  function handleBunkerDisconnect() {
    bunkerStatus = 'idle';
    onBunkerDisconnect();
  }

  // ── Save settings ─────────────────────────────────────────────────────
  function parseLines(text: string): string[] {
    return text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  }

  async function handleSave() {
    saving = true;
    saveMessage = '';

    const updated: BlossomUserSettings = {
      ...untrack(() => settings),          // preserve bunkerLocalKey etc.
      bunkerUri: bunkerUri.trim() || undefined,
      servers: parseLines(serversText),
      relays: parseLines(relaysText),
      visionEndpoint: visionEndpoint.trim() || undefined,
      imageGenEndpoint: untrack(() => settings).imageGenEndpoint,  // preserve if set externally
      disabledPlugins: [...disabledPlugins],  // always persist (even empty) to distinguish from "never saved"
      updatedAt: Date.now(),
    };

    // 1) localStorage (always)
    saveSettingsToLocalStorage(updated, appId);

    // 2) NIP-78 relay sync (if signer + relay available)
    if (signer && relayUrls.length > 0) {
      try {
        await publishSettingsEvent(signer, relayUrls[0], updated);
        saveMessage = 'Gespeichert (lokal + Relay).';
      } catch {
        saveMessage = 'Lokal gespeichert. Relay-Sync fehlgeschlagen.';
      }
    } else {
      saveMessage = 'Lokal gespeichert.';
    }

    onSettingsChanged(updated);
    saving = false;
  }
</script>

<div class="sp-root">
  <!-- Back button -->
  <div class="sp-back-row">
    <button type="button" class="sp-btn-back" onclick={onClose}>← Zurück</button>
    <span class="sp-title">Einstellungen</span>
  </div>

  <!-- ─── Auth info section ─── -->
  <section class="sp-section">
    <h3 class="sp-section-title">Anmelden</h3>

    <!-- Profile (if signed in) -->
    {#if signer && (profile || profileLoading)}
      <div class="sp-profile">
        {#if profileLoading}
          <div class="sp-profile-loading">Profil wird geladen…</div>
        {:else if profile}
          <div class="sp-profile-card">
            {#if profile.picture}
              <img class="sp-avatar" src={profile.picture} alt={profile.name ?? ''} />
            {:else}
              <div class="sp-avatar sp-avatar-placeholder">👤</div>
            {/if}
            <div class="sp-profile-info">
              <span class="sp-profile-name">{profile.displayName ?? profile.name ?? 'Unbekannt'}</span>
              {#if profile.nip05}
                <span class="sp-profile-nip05">{profile.nip05}</span>
              {/if}
              <span class="sp-profile-pubkey">{shortenPubkey(profile.pubkey)}</span>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Extension (NIP-07) info -->
    <div class="sp-info-box">
      <strong>Browser Extension (NIP-07)</strong>
      <p>
        Installiere eine Nostr Signer-Extension, um dich automatisch anzumelden.
        Die Extension wird beim Öffnen des Widgets erkannt.
      </p>
      <div class="sp-extension-links">
        <span>Verfügbare Extensions:</span>
        <a href="https://github.com/nicepayments/nicepay-extension" target="_blank" rel="noopener">Alby</a>
        <a href="https://github.com/nicepayments/nicepay-extension" target="_blank" rel="noopener">nos2x</a>
        <a href="https://apps.apple.com/app/nostore/id1666553677" target="_blank" rel="noopener">Nostore (Safari)</a>
      </div>
    </div>

    <!-- Bunker (NIP-46) -->
    <div class="sp-info-box">
      <strong>Remote Signer / Bunker (NIP-46)</strong>
      <p>
        Verbinde dich mit einem Remote Signer wie
        <a href="https://nsec.app" target="_blank" rel="noopener">nsec.app</a> oder
        <a href="https://app.nsecbunker.com" target="_blank" rel="noopener">nsecBunker</a>.
        Gib die Bunker-URI ein und klicke auf „Verbinden".
      </p>

      {#if bunkerStatus === 'connected'}
        <!-- Connected state: show status + disconnect button -->
        <div class="sp-bunker-connected">
          <span class="sp-bunker-status-dot"></span>
          <span class="sp-bunker-status-text">Bunker verbunden</span>
          <button
            type="button"
            class="sp-btn sp-btn-disconnect"
            onclick={handleBunkerDisconnect}
          >
            Trennen
          </button>
        </div>
        {#if bunkerUri}
          <p class="sp-bunker-uri-hint" title={bunkerUri}>URI: {bunkerUri.length > 50 ? bunkerUri.slice(0, 50) + '…' : bunkerUri}</p>
        {/if}
      {:else}
        <!-- Disconnected state: show input + connect button -->
        <div class="sp-bunker-row">
          <input
            type="text"
            class="sp-input sp-input-bunker"
            placeholder="bunker://pubkey?relay=wss://…&secret=…"
            bind:value={bunkerUri}
          />
          <button
            type="button"
            class="sp-btn sp-btn-connect"
            disabled={bunkerStatus === 'connecting' || !bunkerUri.trim()}
            onclick={handleBunkerConnect}
          >
            {#if bunkerStatus === 'connecting'}
              Verbinde…
            {:else}
              Verbinden
            {/if}
          </button>
        </div>
      {/if}
      {#if bunkerError}
        <p class="sp-error">{bunkerError}</p>
      {/if}
    </div>
  </section>

  <!-- ─── Configuration section ─── -->
  <section class="sp-section">
    <h3 class="sp-section-title">Konfiguration</h3>

    <label class="sp-label">
      <span>Blossom Server</span>
      <span class="sp-hint">Ein Server pro Zeile. Uploadiert Dateien dorthin.</span>
      <textarea
        class="sp-textarea"
        rows="3"
        placeholder="https://blossom.primal.net&#10;https://nostr.download"
        bind:value={serversText}
      ></textarea>
    </label>

    <label class="sp-label">
      <span>Nostr Relays</span>
      <span class="sp-hint">Ein Relay pro Zeile. Für NIP-94 Metadaten und Einstellungs-Sync.</span>
      <textarea
        class="sp-textarea"
        rows="3"
        placeholder="wss://relay.damus.io&#10;wss://relay.primal.net"
        bind:value={relaysText}
      ></textarea>
    </label>

    <label class="sp-label">
      <span>KI-Service URL</span>
      <span class="sp-hint">Basis-URL des Vision-Service (ohne /describe).</span>
      <input
        type="text"
        class="sp-input"
        placeholder="http://localhost:8787"
        bind:value={visionEndpoint}
      />
    </label>
  </section>

  <!-- ─── Plugin toggles ─── -->
  {#if registeredPlugins.length > 0}
    <section class="sp-section">
      <h3 class="sp-section-title">Erweiterungen</h3>
      <span class="sp-hint">Aktiviere oder deaktiviere installierte Tab-Plugins.</span>
      <div class="sp-plugin-list">
        {#each registeredPlugins as plugin (plugin.id)}
          {@const isDisabled = disabledPlugins.has(plugin.id)}
          <label class="sp-plugin-toggle">
            <input
              type="checkbox"
              checked={!isDisabled}
              onchange={() => {
                if (isDisabled) {
                  disabledPlugins.delete(plugin.id);
                } else {
                  disabledPlugins.add(plugin.id);
                }
                // trigger reactivity
                disabledPlugins = new Set(disabledPlugins);
              }}
            />
            {#if plugin.icon}<span class="sp-plugin-icon">{plugin.icon}</span>{/if}
            <span class="sp-plugin-label">{plugin.label}</span>
          </label>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ─── Save ─── -->
  <div class="sp-save-row">
    <button
      type="button"
      class="sp-btn sp-btn-save"
      disabled={saving}
      onclick={handleSave}
    >
      {saving ? 'Speichert…' : 'Einstellungen speichern'}
    </button>
    {#if saveMessage}
      <span class="sp-save-message">{saveMessage}</span>
    {/if}
  </div>

  <p class="sp-footer-hint">
    Einstellungen werden lokal gespeichert.
    {#if signer}
      Mit Signer auch als NIP-78 Event auf deinem Relay.
    {:else}
      Melde dich an, um Einstellungen auch auf deinem Relay zu sichern.
    {/if}
  </p>
</div>

<style>
  .sp-root {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    overflow-y: auto;
    height: 100%;
  }

  /* ── Back row ── */
  .sp-back-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--bm-border-muted);
  }

  .sp-btn-back {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.3rem 0.6rem;
    background: var(--bm-bg-muted);
    border: 1px solid var(--bm-input-border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--bm-text);
  }

  .sp-btn-back:hover {
    background: var(--bm-bg-hover);
  }

  .sp-title {
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--bm-text);
  }

  /* ── Sections ── */
  .sp-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sp-section-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--bm-text);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ── Profile card ── */
  .sp-profile-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bm-bg-subtle);
    border-radius: 8px;
    border: 1px solid var(--bm-border);
  }

  .sp-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .sp-avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bm-bg-muted);
    font-size: 1.4rem;
  }

  .sp-profile-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .sp-profile-name {
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--bm-text);
  }

  .sp-profile-nip05 {
    font-size: 0.8rem;
    color: var(--bm-accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sp-profile-pubkey {
    font-size: 0.75rem;
    color: var(--bm-text-muted);
    font-family: monospace;
  }

  .sp-profile-loading {
    font-size: 0.85rem;
    color: var(--bm-text-muted);
    padding: 0.5rem 0;
  }

  /* ── Info boxes ── */
  .sp-info-box {
    padding: 0.75rem;
    background: var(--bm-bg-subtle);
    border: 1px solid var(--bm-border);
    border-radius: 8px;
    font-size: 0.85rem;
  }

  .sp-info-box strong {
    display: block;
    margin-bottom: 0.3rem;
    color: var(--bm-text);
  }

  .sp-info-box p {
    margin: 0 0 0.5rem 0;
    color: var(--bm-text-muted);
    line-height: 1.4;
  }

  .sp-extension-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.8rem;
    color: var(--bm-text-muted);
  }

  .sp-extension-links a {
    color: var(--bm-accent);
    text-decoration: none;
  }

  .sp-extension-links a:hover {
    text-decoration: underline;
  }

  /* ── Bunker row ── */
  .sp-bunker-row {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .sp-input-bunker {
    flex: 1;
  }

  .sp-bunker-connected {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.5rem 0.65rem;
    background: var(--bm-bg-subtle);
    border: 1px solid var(--bm-accent);
    border-radius: 6px;
  }

  .sp-bunker-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--bm-accent);
    flex-shrink: 0;
  }

  .sp-bunker-status-text {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--bm-text);
  }

  .sp-btn-disconnect {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.3rem 0.7rem;
    border-radius: 4px;
    border: 1px solid var(--bm-danger, #e55);
    background: transparent;
    color: var(--bm-danger, #e55);
    cursor: pointer;
    transition: background 0.15s;
  }

  .sp-btn-disconnect:hover {
    background: color-mix(in srgb, var(--bm-danger, #e55) 12%, transparent);
  }

  .sp-bunker-uri-hint {
    font-size: 0.75rem;
    color: var(--bm-text-muted);
    margin: 0.3rem 0 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
  }

  /* ── Form elements ── */
  .sp-label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--bm-text);
  }

  .sp-hint {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--bm-text-muted);
  }

  .sp-input,
  .sp-textarea {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--bm-input-border);
    border-radius: 4px;
    background: var(--bm-input-bg);
    color: var(--bm-text);
    outline: none;
    transition: border-color 0.15s;
  }

  .sp-input:focus,
  .sp-textarea:focus {
    border-color: var(--bm-accent);
  }

  .sp-textarea {
    resize: vertical;
    min-height: 3rem;
    line-height: 1.4;
  }

  /* ── Buttons ── */
  .sp-btn {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.45rem 0.9rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }

  .sp-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sp-btn-connect {
    background: var(--bm-accent);
    color: #fff;
    white-space: nowrap;
  }

  .sp-btn-connect:hover:not(:disabled) {
    background: var(--bm-accent-hover);
  }

  .sp-btn-save {
    background: var(--bm-accent);
    color: #fff;
  }

  .sp-btn-save:hover:not(:disabled) {
    background: var(--bm-accent-hover);
  }

  /* ── Save row ── */
  .sp-save-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .sp-save-message {
    font-size: 0.8rem;
    color: var(--bm-accent);
  }

  /* ── Messages ── */
  .sp-error {
    font-size: 0.8rem;
    color: var(--bm-danger);
    margin: 0.3rem 0 0 0;
  }

  .sp-footer-hint {
    font-size: 0.75rem;
    color: var(--bm-text-muted);
    margin: 0;
    padding-top: 0.5rem;
    border-top: 1px solid var(--bm-border-muted);
  }

  /* ── Plugin toggles ── */
  .sp-plugin-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }

  .sp-plugin-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .sp-plugin-toggle input[type='checkbox'] {
    accent-color: var(--bm-accent);
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }

  .sp-plugin-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .sp-plugin-label {
    color: var(--bm-text);
  }
</style>
