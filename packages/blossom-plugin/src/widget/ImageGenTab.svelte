<script lang="ts">
  import type { BlossomSigner, BlossomUploadResult } from '../core/types';
  import type { ImageMetadataInput } from '../core/metadata';
  import type { InsertResult, BlossomMediaFeatures } from './types';
  import type { VisionClientOptions } from '../core/vision';
  import type { ImageGenClientOptions } from '../core/imagegen';
  import { fetchImageGeneration } from '../core/imagegen';
  import { createBlossomBridge } from '../core/simple-bridge';
  import {
    buildImageMetadataTags,
  } from '../core/metadata';
  import {
    createImagePreviewFile,
    previewFileBaseName,
  } from '../core/previews';
  import { publishEvent } from '../core/publish';
  import MetadataSidebar from './MetadataSidebar.svelte';

  const THUMB_MAX_DIM = 200;
  const IMAGE_MAX_DIM = 600;

  interface ImageGenTabProps {
    signer: BlossomSigner | null;
    servers: string[];
    relayUrls: string[];
    features: BlossomMediaFeatures;
    visionOptions?: VisionClientOptions;
    imageGenEndpoint: string;
    onInserted: (result: InsertResult) => void;
  }

  let {
    signer,
    servers,
    relayUrls,
    features,
    visionOptions,
    imageGenEndpoint,
    onInserted,
  }: ImageGenTabProps = $props();

  type Phase =
    | { type: 'idle' }
    | { type: 'generating' }
    | { type: 'preview'; imageDataUrl: string }
    | { type: 'uploading'; imageDataUrl: string }
    | { type: 'metadata'; uploadResult: BlossomUploadResult; file: File; mime: string; uploadTags: string[][] }
    | { type: 'publishing' }
    | { type: 'done'; insertResult: InsertResult }
    | { type: 'error'; message: string; canRetry?: boolean };

  let phase = $state<Phase>({ type: 'idle' });
  let prompt = $state('');
  let abortController: AbortController | null = null;

  function getTagValue(tags: string[][], name: string): string | undefined {
    return tags.find((t) => t[0] === name)?.[1];
  }

  function mergePreviewTags(origTags: string[][], previewTags: string[][]): string[][] {
    const tagNames = new Set(previewTags.map((t) => t[0]));
    const filtered = origTags.filter((t) => !tagNames.has(t[0]));
    return [...filtered, ...previewTags];
  }

  /**
   * Convert a base64 data URL to a File object.
   */
  function dataUrlToFile(dataUrl: string, filename: string): File {
    const [header, b64] = dataUrl.split(',');
    const mime = header?.match(/data:([^;]+)/)?.[1] ?? 'image/png';
    const binary = atob(b64 ?? '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], filename, { type: mime });
  }

  async function buildPreviewTags(
    file: File,
    bridge: ReturnType<typeof createBlossomBridge>,
  ): Promise<string[][]> {
    const baseName = previewFileBaseName(file);
    const specs: Array<{ tagName: 'thumb' | 'image'; maxDim: number; suffix: string }> = [
      { tagName: 'thumb', maxDim: THUMB_MAX_DIM, suffix: 'thumb' },
      { tagName: 'image', maxDim: IMAGE_MAX_DIM, suffix: 'preview' },
    ];

    const tags: string[][] = [];

    for (const spec of specs) {
      try {
        const filename = `${baseName}-${spec.suffix}.webp`;
        const previewFile = await createImagePreviewFile(file, spec.maxDim, filename);
        const res = await bridge.uploadFile(previewFile);
        const previewUrl = getTagValue(res.tags.map((t) => [...t]), 'url');
        if (!previewUrl) continue;
        const previewHash = getTagValue(res.tags.map((t) => [...t]), 'x');
        tags.push(previewHash ? [spec.tagName, previewUrl, previewHash] : [spec.tagName, previewUrl]);
      } catch (err) {
        console.warn(`Preview ${spec.tagName} failed:`, err);
      }
    }

    return tags;
  }

  // ── Generate image ────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!prompt.trim()) return;

    phase = { type: 'generating' };
    abortController = new AbortController();

    try {
      const options: ImageGenClientOptions = { endpoint: imageGenEndpoint };
      const result = await fetchImageGeneration(prompt.trim(), options, abortController.signal);
      phase = { type: 'preview', imageDataUrl: result.image };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        phase = { type: 'idle' };
        return;
      }
      phase = {
        type: 'error',
        message: err instanceof Error ? err.message : 'Bildgenerierung fehlgeschlagen.',
        canRetry: true,
      };
    } finally {
      abortController = null;
    }
  }

  function handleCancel() {
    abortController?.abort();
    abortController = null;
    phase = { type: 'idle' };
  }

  function handleRetryGenerate() {
    handleGenerate();
  }

  function handleNewPrompt() {
    prompt = '';
    phase = { type: 'idle' };
  }

  // ── Upload generated image to Blossom ─────────────────────────────────────

  async function handleUpload() {
    if (phase.type !== 'preview') return;

    if (!signer) {
      phase = { type: 'error', message: 'Login erforderlich.' };
      return;
    }

    if (servers.length === 0) {
      phase = { type: 'error', message: 'Kein Blossom-Server konfiguriert.' };
      return;
    }

    const imageDataUrl = phase.imageDataUrl;
    phase = { type: 'uploading', imageDataUrl };

    const bridge = createBlossomBridge({ servers, signer });
    const timestamp = Date.now();
    const file = dataUrlToFile(imageDataUrl, `ai-generated-${timestamp}.png`);

    let uploadResult: BlossomUploadResult;
    try {
      uploadResult = await bridge.uploadFile(file);
    } catch (err) {
      phase = {
        type: 'error',
        message: err instanceof Error ? err.message : 'Upload fehlgeschlagen.',
      };
      return;
    }

    const uploadTags = uploadResult.tags.map((t) => [...t]);

    // Build preview thumbnails
    const previewTags = await buildPreviewTags(file, bridge);
    const mergedTags = mergePreviewTags(uploadTags, previewTags);

    phase = {
      type: 'metadata',
      uploadResult,
      file,
      mime: 'image/png',
      uploadTags: mergedTags,
    };
  }

  // ── Metadata submit → Publish ─────────────────────────────────────────────

  async function handleMetadataSubmit(metadata: ImageMetadataInput) {
    if (phase.type !== 'metadata') return;

    const { uploadResult, uploadTags } = phase;

    if (!signer) {
      phase = { type: 'error', message: 'Signer verloren.' };
      return;
    }

    phase = { type: 'publishing' };

    try {
      const kind1063Tags = buildImageMetadataTags(uploadTags, metadata);

      if (relayUrls.length > 0) {
        await publishEvent(signer, relayUrls, metadata.description, kind1063Tags, 1063);
      }

      const sha256 = getTagValue(uploadTags, 'x');
      const thumbUrl = getTagValue(uploadTags, 'thumb');
      const previewUrl = getTagValue(uploadTags, 'image') ?? thumbUrl;
      const sizeStr = getTagValue(uploadTags, 'size');

      const insertResult: InsertResult = {
        url: uploadResult.url,
        thumbnailUrl: thumbUrl,
        previewUrl: previewUrl,
        mimeType: 'image/png',
        sha256,
        size: sizeStr ? Number(sizeStr) : undefined,
        description: metadata.description,
        alt: metadata.altAttribution,
        author: metadata.author,
        license: metadata.license,
        licenseLabel: metadata.licenseLabel,
        genre: metadata.genre,
        keywords: metadata.keywords,
        tags: uploadTags,
      };

      phase = { type: 'done', insertResult };
      onInserted(insertResult);
    } catch (err) {
      phase = {
        type: 'error',
        message: err instanceof Error ? err.message : 'Publish fehlgeschlagen.',
      };
    }
  }

  function reset() {
    phase = { type: 'idle' };
    // Keep prompt so user can iterate
  }

  function fullReset() {
    prompt = '';
    phase = { type: 'idle' };
  }
</script>

<div class="imagegen-tab">
  {#if phase.type === 'idle'}
    <!-- Prompt input -->
    <div class="prompt-panel">
      <label class="prompt-label" for="imagegen-prompt">
        <span class="prompt-icon">🎨</span>
        Beschreibe das Bild, das du erstellen möchtest
      </label>
      <textarea
        id="imagegen-prompt"
        class="prompt-input"
        bind:value={prompt}
        placeholder="z.B. Ein Sonnenuntergang über einem Ozean im Stil von Monet …"
        rows="4"
        maxlength="2000"
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleGenerate();
          }
        }}
      ></textarea>
      <div class="prompt-footer">
        <span class="char-count">{prompt.length} / 2000</span>
        <button
          type="button"
          class="btn-primary"
          disabled={!prompt.trim()}
          onclick={handleGenerate}
        >✨ Bild generieren</button>
      </div>
      <p class="prompt-hint">Strg+Enter zum Generieren</p>
    </div>

  {:else if phase.type === 'generating'}
    <!-- Generating spinner -->
    <div class="progress-panel">
      <div class="spinner"></div>
      <p class="progress-label">Bild wird generiert…</p>
      <p class="progress-sub">Das kann je nach Modell einige Sekunden bis Minuten dauern.</p>
      <button type="button" class="btn-secondary" onclick={handleCancel}>Abbrechen</button>
    </div>

  {:else if phase.type === 'preview'}
    <!-- Preview generated image -->
    <div class="preview-panel">
      <div class="preview-image-wrapper">
        <img src={phase.imageDataUrl} alt="KI-generiertes Bild" class="preview-image" />
      </div>
      <div class="preview-prompt">
        <strong>Prompt:</strong> {prompt}
      </div>
      <div class="preview-actions">
        <button type="button" class="btn-secondary" onclick={handleRetryGenerate}>🔄 Nochmal</button>
        <button type="button" class="btn-secondary" onclick={handleNewPrompt}>✏️ Neuer Prompt</button>
        <button type="button" class="btn-primary" onclick={handleUpload}>⬆️ Hochladen & Verwenden</button>
      </div>
    </div>

  {:else if phase.type === 'uploading'}
    <!-- Uploading -->
    <div class="progress-panel">
      <div class="upload-preview-small">
        <img src={phase.imageDataUrl} alt="Wird hochgeladen…" class="upload-thumb" />
      </div>
      <div class="progress-icon">⬆️</div>
      <p class="progress-label">Lade hoch…</p>
      <div class="progress-bar" role="progressbar">
        <div class="progress-fill" style="width: 50%"></div>
      </div>
      <p class="signer-hint">
        Falls sich nichts tut: Deine Signer-Extension (nos2x, Alby …) wartet
        möglicherweise auf Bestätigung — prüfe andere Browserfenster oder Popups.
      </p>
    </div>

  {:else if phase.type === 'metadata'}
    <div class="metadata-panel">
      <div class="metadata-header">
        <strong>Metadaten eingeben</strong>
        <button type="button" class="btn-cancel" onclick={reset}>× Abbrechen</button>
      </div>
      <MetadataSidebar
        fileUrl={phase.uploadResult.url}
        mime={phase.mime}
        thumbnailUrl={phase.uploadTags.find((t) => t[0] === 'thumb')?.[1]}
        initialMetadata={{ aiImageMode: 'generated', description: prompt }}
        mode="create"
        {visionOptions}
        showDelete={false}
        showMetadata={features.metadata !== false}
        onSubmit={handleMetadataSubmit}
        onCancel={reset}
      />
    </div>

  {:else if phase.type === 'publishing'}
    <div class="progress-panel">
      <div class="progress-icon">📡</div>
      <p class="progress-label">Veröffentliche Metadaten…</p>
      <div class="progress-bar" role="progressbar">
        <div class="progress-fill" style="width: 70%"></div>
      </div>
    </div>

  {:else if phase.type === 'done'}
    <div class="done-panel">
      <div class="done-icon">✅</div>
      <p class="done-label">Bild erfolgreich erstellt und hochgeladen!</p>
      <p class="done-url">
        <a href={phase.insertResult.url} target="_blank" rel="noreferrer">{phase.insertResult.url}</a>
      </p>
      <button type="button" class="btn-primary" onclick={fullReset}>Neues Bild erstellen</button>
    </div>

  {:else if phase.type === 'error'}
    <div class="error-panel">
      <div class="error-icon">⚠️</div>
      <p class="error-msg">{phase.message}</p>
      <div class="error-actions">
        {#if phase.canRetry}
          <button type="button" class="btn-primary" onclick={handleRetryGenerate}>Nochmal versuchen</button>
        {/if}
        <button type="button" class="btn-secondary" onclick={reset}>Zurück</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .imagegen-tab {
    display: grid;
    height: 100%;
    padding: 0.75rem;
    box-sizing: border-box;
    align-content: start;
    overflow-y: auto;
  }

  /* ── Prompt panel ── */
  .prompt-panel {
    display: grid;
    gap: 0.5rem;
  }

  .prompt-label {
    font-size: 0.9rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .prompt-icon {
    font-size: 1.2rem;
  }

  .prompt-input {
    font: inherit;
    font-size: 0.9rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 6px;
    background: var(--bm-input-bg, #fff);
    color: var(--bm-text, #222);
    resize: vertical;
    min-height: 80px;
    line-height: 1.5;
  }

  .prompt-input:focus {
    outline: 2px solid var(--bm-accent, #6c63ff);
    outline-offset: -1px;
    border-color: var(--bm-accent, #6c63ff);
  }

  .prompt-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .char-count {
    font-size: 0.75rem;
    color: var(--bm-text-subtle, #888);
  }

  .prompt-hint {
    font-size: 0.75rem;
    color: var(--bm-text-subtle, #888);
    margin: 0;
    text-align: right;
  }

  /* ── Preview panel ── */
  .preview-panel {
    display: grid;
    gap: 0.75rem;
  }

  .preview-image-wrapper {
    display: flex;
    justify-content: center;
    background: var(--bm-bg-subtle, #f8f8f8);
    border-radius: 8px;
    overflow: hidden;
    max-height: 500px;
  }

  .preview-image {
    max-width: 100%;
    max-height: 500px;
    object-fit: contain;
  }

  .preview-prompt {
    font-size: 0.8rem;
    color: var(--bm-text-muted, #777);
    padding: 0.4rem 0.6rem;
    background: var(--bm-bg-subtle, #f8f8f8);
    border-radius: 4px;
    word-break: break-word;
  }

  .preview-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  /* ── Progress / spinner ── */
  .progress-panel {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    padding: 2rem;
    text-align: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--bm-border, #e8e8e8);
    border-top-color: var(--bm-accent, #6c63ff);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .progress-icon {
    font-size: 2rem;
  }

  .progress-label {
    font-size: 0.9rem;
    margin: 0;
  }

  .progress-sub {
    font-size: 0.8rem;
    color: var(--bm-text-subtle, #888);
    margin: 0;
  }

  .progress-bar {
    width: 100%;
    max-width: 320px;
    height: 8px;
    background: var(--bm-bg-muted, #e8e8e8);
    border-radius: 9999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--bm-accent, #6c63ff);
    border-radius: 9999px;
    transition: width 0.2s ease;
  }

  .signer-hint {
    font-size: 0.75rem;
    color: var(--bm-text-subtle, #888);
    margin: 0.5rem 0 0;
    max-width: 320px;
    line-height: 1.4;
  }

  .upload-preview-small {
    display: flex;
    justify-content: center;
  }

  .upload-thumb {
    max-width: 120px;
    max-height: 120px;
    border-radius: 6px;
    object-fit: contain;
  }

  /* ── Metadata panel ── */
  .metadata-panel {
    display: grid;
    gap: 0.5rem;
    overflow-y: auto;
    max-height: 100%;
  }

  .metadata-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
  }

  .btn-cancel {
    font: inherit;
    font-size: 0.85rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--bm-text-subtle, #888);
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
  }

  .btn-cancel:hover {
    color: var(--bm-danger, #c0392b);
    background: var(--bm-danger-bg, #fdf0ee);
  }

  /* ── Done panel ── */
  .done-panel {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    padding: 2rem;
    text-align: center;
  }

  .done-icon {
    font-size: 2.5rem;
  }

  .done-label {
    font-weight: 600;
    font-size: 0.95rem;
    margin: 0;
  }

  .done-url {
    font-size: 0.8rem;
    word-break: break-all;
    color: var(--bm-text-muted, #555);
    margin: 0;
  }

  /* ── Error panel ── */
  .error-panel {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    padding: 2rem;
    text-align: center;
  }

  .error-icon {
    font-size: 2rem;
  }

  .error-msg {
    color: var(--bm-danger, #c0392b);
    font-size: 0.9rem;
    margin: 0;
  }

  .error-actions {
    display: flex;
    gap: 0.5rem;
  }

  /* ── Buttons ── */
  .btn-primary {
    font: inherit;
    padding: 0.5rem 1.2rem;
    background: var(--bm-accent, #6c63ff);
    color: #fff;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.12s;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--bm-accent-hover, #5a52d5);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    font: inherit;
    padding: 0.5rem 1.2rem;
    background: var(--bm-bg-muted, #f0f0f0);
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--bm-text, #222);
    transition: background 0.12s;
  }

  .btn-secondary:hover {
    background: var(--bm-bg-hover, #e8e8e8);
  }
</style>
