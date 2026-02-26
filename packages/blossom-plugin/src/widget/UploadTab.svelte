<script lang="ts">
  import type { BlossomSigner, BlossomUploadResult } from '../core/types';
  import type { ImageMetadataInput } from '../core/metadata';
  import type { InsertResult, BlossomMediaFeatures } from './types';
  import type { VisionClientOptions } from '../core/vision';
  import { createBlossomBridge } from '../core/simple-bridge';
  import {
    buildImageMetadataTags,
    buildKind1FallbackTags,
  } from '../core/metadata';
  import {
    createImagePreviewFile,
    createPdfPreviewFile,
    previewFileBaseName,
    normalizeMime,
  } from '../core/previews';
  import { publishEvent } from '../core/publish';
  import MetadataSidebar from './MetadataSidebar.svelte';

  const THUMB_MAX_DIM = 200;
  const IMAGE_MAX_DIM = 600;

  interface UploadTabProps {
    signer: BlossomSigner | null;
    servers: string[];
    relayUrl?: string;
    features: BlossomMediaFeatures;
    visionOptions?: VisionClientOptions;
    onInserted: (result: InsertResult) => void;
  }

  let {
    signer,
    servers,
    relayUrl,
    features,
    visionOptions,
    onInserted,
  }: UploadTabProps = $props();

  type Phase =
    | { type: 'idle' }
    | { type: 'uploading'; fileName: string; progress: number }
    | { type: 'metadata'; uploadResult: BlossomUploadResult; file: File; mime: string; uploadTags: string[][] }
    | { type: 'publishing' }
    | { type: 'done'; insertResult: InsertResult }
    | { type: 'error'; message: string };

  let phase = $state<Phase>({ type: 'idle' });
  let dragOver = $state(false);
  let fileInputRef = $state<HTMLInputElement | null>(null);

  function getTagValue(tags: string[][], name: string): string | undefined {
    return tags.find((t) => t[0] === name)?.[1];
  }

  function mergePreviewTags(origTags: string[][], previewTags: string[][]): string[][] {
    const tagNames = new Set(previewTags.map((t) => t[0]));
    const filtered = origTags.filter((t) => !tagNames.has(t[0]));
    return [...filtered, ...previewTags];
  }

  async function buildPreviewTags(
    file: File,
    mime: string,
    bridge: ReturnType<typeof createBlossomBridge>,
  ): Promise<string[][]> {
    if (!mime.startsWith('image/') && mime !== 'application/pdf') return [];

    const baseName = previewFileBaseName(file);
    const specs: Array<{ tagName: 'thumb' | 'image'; maxDim: number; suffix: string }> =
      mime === 'application/pdf'
        ? [{ tagName: 'thumb', maxDim: THUMB_MAX_DIM, suffix: 'thumb' }]
        : [
            { tagName: 'thumb', maxDim: THUMB_MAX_DIM, suffix: 'thumb' },
            { tagName: 'image', maxDim: IMAGE_MAX_DIM, suffix: 'preview' },
          ];

    const tags: string[][] = [];

    for (const spec of specs) {
      try {
        const filename = `${baseName}-${spec.suffix}.webp`;
        const previewFile =
          mime === 'application/pdf'
            ? await createPdfPreviewFile(file, spec.maxDim, filename)
            : await createImagePreviewFile(file, spec.maxDim, filename);
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

  async function processFile(file: File) {
    if (!signer) {
      phase = { type: 'error', message: 'Login erforderlich.' };
      return;
    }

    if (servers.length === 0) {
      phase = { type: 'error', message: 'Kein Blossom-Server konfiguriert.' };
      return;
    }

    phase = { type: 'uploading', fileName: file.name, progress: 0 };

    const bridge = createBlossomBridge({ servers, signer });
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

    const rawMime = getTagValue(uploadResult.tags.map((t) => [...t]), 'm') || file.type;
    const mime = normalizeMime(rawMime);
    const uploadTags = uploadResult.tags.map((t) => [...t]);

    // For non-media files just insert directly without metadata dialog
    if (!mime.startsWith('image/') && mime !== 'application/pdf') {
      const insertResult: InsertResult = {
        url: uploadResult.url,
        mimeType: mime,
        sha256: getTagValue(uploadTags, 'x'),
        tags: uploadTags,
      };
      phase = { type: 'done', insertResult };
      onInserted(insertResult);
      return;
    }

    // Build preview thumbnails (upload them too)
    phase = { type: 'uploading', fileName: file.name, progress: 50 };
    const previewTags = await buildPreviewTags(file, mime, bridge);
    const mergedTags = mergePreviewTags(uploadTags, previewTags);

    phase = {
      type: 'metadata',
      uploadResult,
      file,
      mime,
      uploadTags: mergedTags,
    };
  }

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
      const kind1Tags = buildKind1FallbackTags(uploadTags, metadata);

      const publishedEventIds: string[] = [];

      if (relayUrl) {
        const res1063 = await publishEvent(signer, relayUrl, metadata.description, kind1063Tags, 1063);
        const res1 = await publishEvent(signer, relayUrl, metadata.description, kind1Tags, 1);
        const id1063 = (res1063.event as Record<string, unknown> | null)?.id;
        const id1 = (res1.event as Record<string, unknown> | null)?.id;
        if (typeof id1063 === 'string') publishedEventIds.push(id1063);
        if (typeof id1 === 'string') publishedEventIds.push(id1);
      }

      const sha256 = getTagValue(uploadTags, 'x');
      const thumbUrl = getTagValue(uploadTags, 'thumb');
      const previewUrl = getTagValue(uploadTags, 'image') ?? thumbUrl;
      const sizeStr = getTagValue(uploadTags, 'size');

      const insertResult: InsertResult = {
        url: uploadResult.url,
        thumbnailUrl: thumbUrl,
        previewUrl: previewUrl,
        mimeType: phase.mime,
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
    dragOver = false;
  }

  function openFilePicker() {
    fileInputRef?.click();
  }

  function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.item(0);
    if (file) processFile(file);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files?.item(0);
    if (file) processFile(file);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }
</script>

<div class="upload-tab">
  {#if phase.type === 'idle'}
    <!-- Drop zone -->
    <div
      role="button"
      tabindex="0"
      class="dropzone"
      class:hovering={dragOver}
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={() => (dragOver = false)}
      onclick={openFilePicker}
      onkeydown={(e) => e.key === 'Enter' && openFilePicker()}
    >
      <span class="dz-icon">📤</span>
      <p class="dz-label">Datei hierher ziehen oder klicken zum Auswählen</p>
      <p class="dz-sub">Bilder, PDFs und andere Dateien werden unterstützt</p>
    </div>
    <input
      bind:this={fileInputRef}
      type="file"
      class="hidden-input"
      onchange={handleFileChange}
    />

  {:else if phase.type === 'uploading'}
    <div class="progress-panel">
      <div class="progress-icon">⬆️</div>
      <p class="progress-label">Lade hoch: <strong>{phase.fileName}</strong></p>
      <div class="progress-bar" role="progressbar">
        <div class="progress-fill" style="width: {phase.progress}%"></div>
      </div>
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
      <p class="done-label">Datei erfolgreich hochgeladen!</p>
      <p class="done-url">
        <a href={phase.insertResult.url} target="_blank" rel="noreferrer">{phase.insertResult.url}</a>
      </p>
      <button type="button" class="btn-primary" onclick={reset}>Weitere Datei hochladen</button>
    </div>

  {:else if phase.type === 'error'}
    <div class="error-panel">
      <div class="error-icon">⚠️</div>
      <p class="error-msg">{phase.message}</p>
      <button type="button" class="btn-secondary" onclick={reset}>Nochmal versuchen</button>
    </div>
  {/if}
</div>

<style>
  .upload-tab {
    display: grid;
    height: 100%;
    padding: 0.75rem;
    box-sizing: border-box;
    align-content: start;
  }

  .hidden-input {
    display: none;
  }

  /* ── Drop zone ── */
  .dropzone {
    border: 2px dashed #c0bfff;
    border-radius: 10px;
    padding: 2.5rem 1.5rem;
    text-align: center;
    cursor: pointer;
    background: #faf9ff;
    transition: background 0.15s, border-color 0.15s;
    display: grid;
    gap: 0.35rem;
    justify-items: center;
  }

  .dropzone.hovering {
    background: #f0eeff;
    border-color: #6c63ff;
  }

  .dz-icon {
    font-size: 2.5rem;
    line-height: 1;
  }

  .dz-label {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
  }

  .dz-sub {
    font-size: 0.8rem;
    color: #888;
    margin: 0;
  }

  /* ── Progress ── */
  .progress-panel {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    padding: 2rem;
    text-align: center;
  }

  .progress-icon {
    font-size: 2rem;
  }

  .progress-label {
    font-size: 0.9rem;
    margin: 0;
  }

  .progress-bar {
    width: 100%;
    max-width: 320px;
    height: 8px;
    background: #e8e8e8;
    border-radius: 9999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #6c63ff;
    border-radius: 9999px;
    transition: width 0.2s ease;
  }

  /* ── Metadata panel ── */
  .metadata-panel {
    display: grid;
    gap: 0.5rem;
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
    color: #888;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
  }

  .btn-cancel:hover {
    color: #c0392b;
    background: #fdf0ee;
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
    color: #555;
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
    color: #c0392b;
    font-size: 0.9rem;
    margin: 0;
  }

  /* ── Buttons ── */
  .btn-primary {
    font: inherit;
    padding: 0.5rem 1.2rem;
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
    padding: 0.5rem 1.2rem;
    background: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.875rem;
  }
</style>
