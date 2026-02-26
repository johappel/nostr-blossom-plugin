<script lang="ts">
  import {
    LICENSE_PRESETS,
    NO_LICENSE_ID,
    CUSTOM_LICENSE_ID,
    CC0_LICENSE_ID,
    resolveLicenseChoice,
  } from '../core/licenses';
  import type { ImageMetadataInput } from '../core/metadata';
  import type { VisionClientOptions } from '../core/vision';
  import { fetchVisionSuggestion } from '../core/vision';
  import { untrack } from 'svelte';

  interface MetadataSidebarProps {
    /** File URL (shown in preview and used for Vision API) */
    fileUrl: string;
    /** MIME type of the file */
    mime: string;
    /** Thumbnail URL for preview */
    thumbnailUrl?: string;
    /** Initial metadata (for editing mode) */
    initialMetadata?: Partial<ImageMetadataInput>;
    /** Mode — 'create' shows "Speichern", 'edit' shows "Aktualisieren" */
    mode: 'create' | 'edit';
    /** Vision endpoint config (optional; hides AI button if not provided) */
    visionOptions?: VisionClientOptions;
    /** Whether the delete button should be shown */
    showDelete?: boolean;
    /** Whether the metadata form is shown at all */
    showMetadata?: boolean;
    /** Called with the filled metadata when user submits */
    onSubmit: (metadata: ImageMetadataInput) => void;
    /** Called when user clicks "Löschen" */
    onDelete?: () => void;
    /** Called when user cancels */
    onCancel?: () => void;
  }

  let {
    fileUrl,
    mime,
    thumbnailUrl,
    initialMetadata,
    mode = 'create',
    visionOptions,
    showDelete = false,
    showMetadata = true,
    onSubmit,
    onDelete,
    onCancel,
  }: MetadataSidebarProps = $props();

  const AI_AUTHOR_GENERATED = 'KI generiert';
  const AI_AUTHOR_ASSISTED = 'Mit Hilfe von KI generiert';

  // Form state — untrack() suppresses the "only captures initial value" warning
  // intentionally: this is an edit form that takes a snapshot of initialMetadata.
  let description = $state(untrack(() => initialMetadata?.description ?? ''));
  let altAttribution = $state(untrack(() => initialMetadata?.altAttribution ?? ''));
  let genre = $state(untrack(() => initialMetadata?.genre ?? ''));
  let author = $state(untrack(() => initialMetadata?.author ?? ''));
  let keywords = $state(untrack(() => initialMetadata?.keywords?.join(', ') ?? ''));
  let aiImageMode = $state<'none' | 'generated' | 'assisted'>(
    untrack(() => (initialMetadata?.aiImageMode as 'none' | 'generated' | 'assisted') ?? 'none'),
  );
  let aiMetadataGenerated = $state(untrack(() => Boolean(initialMetadata?.aiMetadataGenerated)));

  const initialLicense = untrack(() =>
    resolveLicenseChoice(initialMetadata?.license, initialMetadata?.licenseLabel),
  );
  let licenseChoice = $state(initialLicense.choice);
  let customLicenseSpec = $state(initialLicense.customSpec);

  let validationError = $state('');
  let visionLoading = $state(false);
  let visionError = $state('');
  let visionChangedDescription = $state(false);
  let visionChangedAlt = $state(false);
  let visionChangedGenre = $state(false);
  let visionChangedKeywords = $state(false);

  let isPdf = $derived(mime.trim().toLowerCase() === 'application/pdf');
  let isImage = $derived(mime.trim().toLowerCase().startsWith('image/'));

  // Auto-set AI author + CC0 when AI mode is selected
  $effect(() => {
    if (aiImageMode === 'none') return;
    author = aiImageMode === 'generated' ? AI_AUTHOR_GENERATED : AI_AUTHOR_ASSISTED;
    licenseChoice = CC0_LICENSE_ID;
    customLicenseSpec = '';
  });

  async function suggestFromVision() {
    if (!visionOptions || !fileUrl) {
      visionError = 'Kein Vision-Endpoint konfiguriert.';
      return;
    }

    visionLoading = true;
    visionError = '';

    try {
      const result = await fetchVisionSuggestion(fileUrl, visionOptions);

      if (result.description) {
        visionChangedDescription = result.description !== description;
        description = result.description;
        aiMetadataGenerated = true;
      }
      if (result.alt) {
        visionChangedAlt = result.alt !== altAttribution;
        altAttribution = result.alt;
      }
      if (result.genre) {
        visionChangedGenre = result.genre !== genre;
        genre = result.genre;
        aiMetadataGenerated = true;
      }
      if (!keywords.trim() && result.tags?.length) {
        const next = result.tags.join(', ');
        visionChangedKeywords = next !== keywords;
        keywords = next;
        aiMetadataGenerated = true;
      }
    } catch (error) {
      visionError = error instanceof Error ? error.message : 'Vision-Anfrage fehlgeschlagen';
    } finally {
      visionLoading = false;
    }
  }

  function resolveCurrentLicense(): { canonical: string; label: string } {
    if (aiImageMode !== 'none') {
      const cc0 = LICENSE_PRESETS.find((p) => p.id === CC0_LICENSE_ID)!;
      return { canonical: cc0.canonical, label: cc0.licenseLabel };
    }
    if (licenseChoice === NO_LICENSE_ID) return { canonical: '', label: '' };
    if (licenseChoice === CUSTOM_LICENSE_ID) {
      const idx = customLicenseSpec.indexOf('|');
      if (idx < 0) return { canonical: customLicenseSpec.trim(), label: '' };
      return {
        canonical: customLicenseSpec.slice(0, idx).trim(),
        label: customLicenseSpec.slice(idx + 1).trim(),
      };
    }
    const preset = LICENSE_PRESETS.find((p) => p.id === licenseChoice);
    return preset ? { canonical: preset.canonical, label: preset.licenseLabel } : { canonical: '', label: '' };
  }

  function submit() {
    validationError = '';
    const desc = description.trim();
    const alt = altAttribution.trim();

    if (!desc || !alt) {
      validationError = 'Beschreibung und Alt-Attribution sind Pflichtfelder.';
      return;
    }

    if (aiImageMode === 'none' && licenseChoice === CUSTOM_LICENSE_ID) {
      if (!customLicenseSpec.includes('|')) {
        validationError = 'Für "Andere Lizenz" bitte das Format uri|label verwenden.';
        return;
      }
    }

    const { canonical, label } = resolveCurrentLicense();
    const resolvedAuthor =
      aiImageMode !== 'none'
        ? aiImageMode === 'generated'
          ? AI_AUTHOR_GENERATED
          : AI_AUTHOR_ASSISTED
        : author.trim();

    onSubmit({
      description: desc,
      altAttribution: alt,
      genre: genre.trim(),
      author: resolvedAuthor,
      license: canonical,
      licenseLabel: label || undefined,
      aiImageMode: aiImageMode === 'none' ? undefined : aiImageMode,
      aiMetadataGenerated,
      keywords: keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    });
  }
</script>

<div class="metadata-sidebar">
  <!-- Preview -->
  {#if thumbnailUrl}
    <img class="sidebar-preview" src={thumbnailUrl} alt={altAttribution || description || 'Vorschau'} />
  {:else if isImage && fileUrl}
    <img class="sidebar-preview" src={fileUrl} alt={altAttribution || description || 'Vorschau'} />
  {:else if isPdf}
    <div class="sidebar-preview-placeholder">📄 PDF — <a href={fileUrl} target="_blank" rel="noreferrer">Öffnen</a></div>
  {/if}

  {#if showMetadata}
    <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
      <label class="field">
        <span>Beschreibung *</span>
        <textarea
          rows="3"
          bind:value={description}
          required
          class:vision-updated={visionChangedDescription}
        ></textarea>
      </label>

      {#if visionOptions}
        <button
          type="button"
          class="btn-vision"
          onclick={suggestFromVision}
          disabled={visionLoading || !fileUrl}
        >
          {visionLoading
            ? (isPdf ? 'Analysiere PDF…' : 'Analysiere Bild…')
            : 'KI-Vorschlag'}
        </button>
        {#if visionError}
          <p class="error">{visionError}</p>
        {/if}
      {/if}

      <label class="field">
        <span>Alt-Text / Attribution *</span>
        <input
          bind:value={altAttribution}
          required
          class:vision-updated={visionChangedAlt}
        />
      </label>

      <label class="field">
        <span>Genre</span>
        <input
          bind:value={genre}
          placeholder="z. B. photorealistic, aquarell"
          class:vision-updated={visionChangedGenre}
        />
      </label>

      <label class="field">
        <span>Autor</span>
        <input bind:value={author} disabled={aiImageMode !== 'none'} />
      </label>

      <label class="field">
        <span>KI-Status</span>
        <select bind:value={aiImageMode}>
          <option value="none">Keine KI-Angabe</option>
          <option value="generated">KI generiert</option>
          <option value="assisted">Mit Hilfe von KI generiert</option>
        </select>
      </label>

      {#if aiImageMode !== 'none'}
        <p class="note">Bei KI-Bildern wird automatisch CC0 als Lizenz gesetzt.</p>
      {/if}

      <label class="field">
        <span>Lizenz</span>
        <select bind:value={licenseChoice} disabled={aiImageMode !== 'none'}>
          <option value={NO_LICENSE_ID}>Keine Lizenz</option>
          {#each LICENSE_PRESETS as preset}
            <option value={preset.id}>{preset.label}</option>
          {/each}
          <option value={CUSTOM_LICENSE_ID}>Andere Lizenz</option>
        </select>
      </label>

      {#if aiImageMode === 'none' && licenseChoice === CUSTOM_LICENSE_ID}
        <label class="field">
          <span>Andere Lizenz (uri|label)</span>
          <input
            bind:value={customLicenseSpec}
            placeholder="https://example.com/license|Custom License"
          />
        </label>
      {/if}

      <label class="field field-checkbox">
        <input type="checkbox" bind:checked={aiMetadataGenerated} />
        <span>Beschreibung/Keywords wurden mit KI erstellt</span>
      </label>

      <label class="field">
        <span>Keywords</span>
        <input
          bind:value={keywords}
          placeholder="nostr, blossom, foto"
          class:vision-updated={visionChangedKeywords}
        />
      </label>

      {#if validationError}
        <p class="error">{validationError}</p>
      {/if}

      <div class="actions">
        {#if onCancel}
          <button type="button" class="btn-secondary" onclick={onCancel}>Abbrechen</button>
        {/if}
        {#if showDelete && onDelete}
          <button type="button" class="btn-delete" onclick={onDelete}>🗑 Löschen</button>
        {/if}
        <button type="submit" class="btn-primary">
          {mode === 'edit' ? 'Aktualisieren' : 'Übernehmen'}
        </button>
      </div>
    </form>
  {:else}
    <!-- Read-only mode: only apply/delete actions -->
    <div class="actions">
      {#if showDelete && onDelete}
        <button type="button" class="btn-delete" onclick={onDelete}>🗑 Löschen</button>
      {/if}
      <button type="button" class="btn-primary" onclick={() => submit()}>Übernehmen</button>
    </div>
  {/if}
</div>

<style>
  .metadata-sidebar {
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem;
    overflow-y: auto;
  }

  .sidebar-preview {
    max-width: 100%;
    max-height: 200px;
    object-fit: contain;
    border-radius: 6px;
    border: 1px solid #ddd;
    background: #f8f8f8;
  }

  .sidebar-preview-placeholder {
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 6px;
    text-align: center;
    font-size: 0.9rem;
  }

  form {
    display: grid;
    gap: 0.6rem;
  }

  .field {
    display: grid;
    gap: 0.25rem;
    font-size: 0.875rem;
  }

  .field span {
    font-weight: 500;
    color: #555;
  }

  .field input,
  .field textarea,
  .field select {
    font: inherit;
    font-size: 0.875rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    width: 100%;
    box-sizing: border-box;
  }

  .field textarea {
    resize: vertical;
  }

  .field-checkbox {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    grid-template-columns: auto 1fr;
  }

  .field-checkbox input {
    width: auto;
  }

  .vision-updated {
    border-color: #6c63ff !important;
    outline: 2px dashed #6c63ff;
    outline-offset: 1px;
  }

  .btn-vision {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.35rem 0.75rem;
    background: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-vision:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .note {
    font-size: 0.8rem;
    color: #666;
    margin: 0;
  }

  .error {
    color: #c0392b;
    font-size: 0.85rem;
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
    margin-top: 0.25rem;
  }

  .btn-primary {
    font: inherit;
    padding: 0.5rem 1rem;
    background: #6c63ff;
    color: #fff;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .btn-primary:hover {
    background: #5a52d5;
  }

  .btn-secondary {
    font: inherit;
    padding: 0.5rem 1rem;
    background: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .btn-delete {
    font: inherit;
    padding: 0.5rem 1rem;
    background: #fff;
    color: #c0392b;
    border: 1px solid #c0392b;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .btn-delete:hover {
    background: #fdf0ee;
  }
</style>
