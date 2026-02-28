<!--
  OerShareForm — AMB metadata form overlay

  Presented when the user clicks "Im Edufeed teilen" on a gallery item.
  Pre-fills fields from NIP-94 metadata and offers SKOS vocabulary selectors
  for educational metadata. On submit, publishes a kind:30142 event.

  Props:
    nip94     — The NIP-94 file event being shared
    ctx       — Widget context (signer, relay info)
    onclose   — Called when the overlay should be dismissed
    relayUrl  — Override AMB relay URL
    vocabUrls — Override vocabulary URLs
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Nip94FileEvent, WidgetContext } from '@blossom/plugin/plugin';
  import SkosSelector from './SkosSelector.svelte';
  import { mapNip94ToAmb } from './nostr/amb-tags';
  import { publishAmbEvent } from './nostr/publish-amb';
  import type { AmbFormData, AmbShareItem, SkosSelection } from './nostr/types';
  import { DEFAULT_AMB_RELAY, DEFAULT_VOCAB_URLS } from './config';

  let {
    nip94,
    editItem,
    ctx,
    onclose,
    onsaved,
    relayUrl = DEFAULT_AMB_RELAY,
    vocabUrls = DEFAULT_VOCAB_URLS,
  }: {
    nip94?: Nip94FileEvent;
    editItem?: AmbShareItem;
    ctx: WidgetContext;
    onclose: () => void;
    onsaved?: () => void;
    relayUrl?: string;
    vocabUrls?: Record<string, string>;
  } = $props();

  const isEditMode = untrack(() => !!editItem);

  // ── Form state (pre-filled from editItem or NIP-94 — captured once on mount) ──
  const initial: AmbFormData = untrack(() => {
    if (editItem) {
      return {
        name: editItem.name,
        description: editItem.description,
        keywords: editItem.keywords,
        creatorName: editItem.creatorName ?? undefined,
        licenseUrl: editItem.licenseId ?? undefined,
        audience: editItem.audience,
        educationalLevel: editItem.educationalLevel,
        learningResourceType: editItem.learningResourceType,
        about: editItem.about,
        inLanguage: editItem.inLanguage ?? 'de',
        isAccessibleForFree: editItem.isAccessibleForFree ?? true,
        encodingUrl: editItem.encodingUrl,
        imageUrl: editItem.imageUrl,
      };
    }
    if (nip94) return mapNip94ToAmb(nip94);
    return {
      name: '', description: '', keywords: [],
      audience: [], educationalLevel: [], learningResourceType: [], about: [],
      inLanguage: 'de', isAccessibleForFree: true,
    };
  });

  const isImage = untrack(() => {
    if (editItem) return !!editItem.imageUrl;
    return nip94?.mime?.startsWith('image/') ?? false;
  });

  // d-tag for addressable event replacement
  const existingDTag = untrack(() => editItem?.dTag);

  // Preview info
  const previewImage = untrack(() => {
    if (editItem) return editItem.imageUrl;
    return nip94?.thumbUrl ?? nip94?.imageUrl;
  });
  const previewLabel = untrack(() => {
    if (editItem) return editItem.name || editItem.encodingUrl;
    return nip94?.content ?? nip94?.url;
  });

  let name = $state(initial.name);
  let description = $state(initial.description);
  let keywordsText = $state(initial.keywords.join(', '));
  let creatorName = $state(initial.creatorName ?? '');
  let licenseUrl = $state(initial.licenseUrl ?? '');
  let inLanguage = $state(initial.inLanguage);

  let audience = $state<SkosSelection[]>(
    initial.audience.length > 0
      ? initial.audience
      : isImage && !isEditMode
        ? [{ id: 'https://w3id.org/kim/lrmi-audience-role/general-public', prefLabel: 'Allgemeinheit' }]
        : [],
  );
  let educationalLevel = $state<SkosSelection[]>(initial.educationalLevel);
  let learningResourceType = $state<SkosSelection[]>(
    initial.learningResourceType.length > 0
      ? initial.learningResourceType
      : isImage && !isEditMode
        ? [{ id: 'https://vocabs.sodix.de/sodix/educational/learningresourcetype/BILD', prefLabel: 'Bild' }]
        : [],
  );
  let about = $state<SkosSelection[]>(initial.about);

  // ── UI state ──
  let submitting = $state(false);
  let statusMessage = $state('');
  let statusType = $state<'info' | 'error' | 'success'>('info');

  // License presets for <select>
  const licenseOptions = [
    { value: '', label: '— Keine Lizenz —' },
    { value: 'https://creativecommons.org/licenses/by/4.0/', label: 'CC BY 4.0' },
    { value: 'https://creativecommons.org/licenses/by-sa/4.0/', label: 'CC BY-SA 4.0' },
    { value: 'https://creativecommons.org/licenses/by-nc/4.0/', label: 'CC BY-NC 4.0' },
    { value: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', label: 'CC BY-NC-SA 4.0' },
    { value: 'https://creativecommons.org/licenses/by-nd/4.0/', label: 'CC BY-ND 4.0' },
    { value: 'https://creativecommons.org/licenses/by-nc-nd/4.0/', label: 'CC BY-NC-ND 4.0' },
    { value: 'https://creativecommons.org/publicdomain/zero/1.0/', label: 'CC0 1.0 (Public Domain)' },
  ];

  /** Validate & build form data. */
  function buildFormData(): AmbFormData | null {
    if (!name.trim()) {
      statusMessage = 'Name ist erforderlich.';
      statusType = 'error';
      return null;
    }
    if (!description.trim()) {
      statusMessage = 'Beschreibung ist erforderlich.';
      statusType = 'error';
      return null;
    }

    const keywords = keywordsText
      .split(/[,;]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    return {
      ...initial,
      name: name.trim(),
      description: description.trim(),
      keywords,
      creatorName: creatorName.trim() || undefined,
      licenseUrl: licenseUrl || undefined,
      inLanguage,
      isAccessibleForFree: true,
      audience,
      educationalLevel,
      learningResourceType,
      about,
    };
  }

  async function handleSubmit() {
    const signer = ctx.signer;
    if (!signer) {
      statusMessage = 'Bitte zuerst anmelden.';
      statusType = 'error';
      return;
    }

    const formData = buildFormData();
    if (!formData) return;

    // Set creator pubkey from signer
    try {
      formData.creatorPubkey = await signer.getPublicKey();
    } catch {
      // Continue without pubkey — fallback to name
    }

    submitting = true;
    statusMessage = 'Wird an Edufeed gesendet…';
    statusType = 'info';

    try {
      const result = await publishAmbEvent(signer, formData, relayUrl, existingDTag);
      const anySuccess = result.relays.some((r) => r.ok);

      if (anySuccess) {
        statusMessage = isEditMode ? '✓ Erfolgreich aktualisiert!' : '✓ Erfolgreich im Edufeed geteilt!';
        statusType = 'success';
        // Auto-close after short delay
        setTimeout(() => {
          onsaved?.();
          onclose();
        }, 1500);
      } else {
        const errors = result.relays
          .filter((r) => !r.ok)
          .map((r) => `${r.relayUrl}: ${r.error}`)
          .join('; ');
        statusMessage = `Fehler: ${errors}`;
        statusType = 'error';
        submitting = false;
      }
    } catch (err) {
      statusMessage = `Fehler: ${err instanceof Error ? err.message : String(err)}`;
      statusType = 'error';
      submitting = false;
    }
  }
</script>

<div class="oer-form-overlay" role="dialog" aria-label="OER im Edufeed teilen">
  <!-- Backdrop click closes -->
  <button
    type="button"
    class="oer-form-backdrop"
    onclick={onclose}
    aria-label="Schließen"
    tabindex="-1"
  ></button>

  <div class="oer-form-dialog">
    <!-- Header -->
    <div class="oer-form-header">
      <span class="oer-form-title">{isEditMode ? '✏️ OER-Share bearbeiten' : '🎓 Im Edufeed teilen'}</span>
      <button type="button" class="oer-form-close" onclick={onclose}>&times;</button>
    </div>

    <!-- Preview -->
    {#if previewImage}
      <div class="oer-form-preview">
        <img
          src={previewImage}
          alt=""
          class="oer-form-thumb"
        />
        <span class="oer-form-filename">{previewLabel}</span>
      </div>
    {/if}

    <!-- Scrollable form body -->
    <div class="oer-form-body">
      <!-- Name -->
      <label class="oer-field">
        <span class="oer-label">Name *</span>
        <input
          type="text"
          class="oer-input"
          bind:value={name}
          placeholder="Titel der Ressource"
          required
        />
      </label>

      <!-- Description -->
      <label class="oer-field">
        <span class="oer-label">Beschreibung *</span>
        <textarea
          class="oer-textarea"
          bind:value={description}
          placeholder="Kurze Beschreibung der Bildungsressource"
          rows="3"
          required
        ></textarea>
      </label>

      <!-- Author -->
      <label class="oer-field">
        <span class="oer-label">Autor</span>
        <input
          type="text"
          class="oer-input"
          bind:value={creatorName}
          placeholder="Name des Autors / der Autorin"
        />
      </label>

      <!-- License -->
      <label class="oer-field">
        <span class="oer-label">Lizenz</span>
        <select class="oer-select" bind:value={licenseUrl}>
          {#each licenseOptions as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </label>

      <!-- Keywords -->
      <label class="oer-field">
        <span class="oer-label">Schlagworte</span>
        <input
          type="text"
          class="oer-input"
          bind:value={keywordsText}
          placeholder="Komma-getrennte Schlagworte"
        />
        <span class="oer-hint">Durch Komma getrennt eingeben</span>
      </label>

      <!-- Language -->
      <label class="oer-field">
        <span class="oer-label">Sprache</span>
        <select class="oer-select" bind:value={inLanguage}>
          <option value="de">Deutsch</option>
          <option value="en">Englisch</option>
          <option value="fr">Französisch</option>
          <option value="es">Spanisch</option>
          <option value="it">Italienisch</option>
          <option value="tr">Türkisch</option>
          <option value="ru">Russisch</option>
          <option value="ar">Arabisch</option>
        </select>
      </label>

      <hr class="oer-divider" />

      <!-- SKOS Vocabulary Selectors -->
      <SkosSelector
        vocabUrl={vocabUrls.audience ?? ''}
        vocabKey="audience"
        label="Zielgruppe"
        selected={audience}
        onchange={(sel) => (audience = sel)}
      />

      <SkosSelector
        vocabUrl={vocabUrls.educationalLevel ?? ''}
        vocabKey="educationalLevel"
        label="Bildungsstufe"
        selected={educationalLevel}
        onchange={(sel) => (educationalLevel = sel)}
      />

      <SkosSelector
        vocabUrl={vocabUrls.learningResourceType ?? ''}
        vocabKey="learningResourceType"
        label="Ressourcentyp"
        selected={learningResourceType}
        onchange={(sel) => (learningResourceType = sel)}
      />

      <SkosSelector
        vocabUrl={vocabUrls.about ?? ''}
        vocabKey="about"
        label="Fach / Thema"
        selected={about}
        onchange={(sel) => (about = sel)}
      />
    </div>

    <!-- Actions -->
    <div class="oer-form-actions">
      {#if statusMessage}
        <div
          class="oer-form-status"
          class:oer-status-error={statusType === 'error'}
          class:oer-status-success={statusType === 'success'}
        >
          {statusMessage}
        </div>
      {/if}
      <div class="oer-form-buttons">
        <button type="button" class="oer-btn-cancel" onclick={onclose} disabled={submitting}>
          Abbrechen
        </button>
        <button
          type="button"
          class="oer-btn-submit"
          onclick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Wird gesendet…' : isEditMode ? 'Änderungen speichern' : 'Jetzt im Edufeed teilen'}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .oer-form-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .oer-form-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    border: none;
    cursor: default;
  }

  .oer-form-dialog {
    position: relative;
    background: var(--bm-bg, #fff);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    width: min(460px, 95%);
    max-height: 90%;
    overflow: hidden;
  }

  .oer-form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8rem 1rem;
    border-bottom: 1px solid var(--bm-input-border, #eee);
    flex-shrink: 0;
  }

  .oer-form-title {
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--bm-text, #222);
  }

  .oer-form-close {
    background: none;
    border: none;
    font-size: 1.3rem;
    cursor: pointer;
    color: var(--bm-text-muted, #888);
    padding: 0 4px;
    line-height: 1;
  }

  .oer-form-preview {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bm-bg-subtle, #f8f8f8);
    flex-shrink: 0;
  }

  .oer-form-thumb {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .oer-form-filename {
    font-size: 0.76rem;
    color: var(--bm-text-muted, #666);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .oer-form-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.8rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .oer-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .oer-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--bm-text-muted, #666);
  }

  .oer-input,
  .oer-textarea,
  .oer-select {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 6px;
    background: var(--bm-input-bg, #fff);
    color: var(--bm-text, #222);
    width: 100%;
    box-sizing: border-box;
  }

  .oer-textarea {
    resize: vertical;
    min-height: 60px;
  }

  .oer-hint {
    font-size: 0.7rem;
    color: var(--bm-text-muted, #999);
  }

  .oer-divider {
    border: none;
    border-top: 1px solid var(--bm-input-border, #eee);
    margin: 0.4rem 0;
  }

  .oer-form-actions {
    border-top: 1px solid var(--bm-input-border, #eee);
    padding: 0.6rem 1rem;
    flex-shrink: 0;
  }

  .oer-form-status {
    font-size: 0.78rem;
    text-align: center;
    padding: 0.3rem;
    margin-bottom: 0.4rem;
    color: var(--bm-text-muted, #888);
  }

  .oer-status-error {
    color: var(--bm-danger, #d63031);
  }

  .oer-status-success {
    color: var(--bm-accent, #6c63ff);
  }

  .oer-form-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .oer-btn-cancel,
  .oer-btn-submit {
    font: inherit;
    font-size: 0.82rem;
    padding: 0.45rem 1rem;
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

  .oer-btn-submit:disabled,
  .oer-btn-cancel:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
