<script lang="ts">
  import {
    BlossomExtension,
    createBlossomBridge,
    uploadAndInsertBlossomMedia,
    useBlossomInput,
  } from '@blossom/plugin';
  import type { BlossomMediaPayload, TiptapInsertMediaEditor } from '@blossom/plugin';
  import { Editor } from '@tiptap/core';
  import Image from '@tiptap/extension-image';
  import StarterKit from '@tiptap/starter-kit';
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import {
    addUploadHistory,
    updateLatestUploadHistoryByUrl,
    uploadHistoryStore,
  } from '$lib/stores/uploads';
  import { connectNip07Signer, connectNip46Signer } from '$lib/nostr/signers';
  import type { SignerAdapter } from '$lib/nostr/signers';
  import {
    buildImageMetadataTags,
    buildKind1FallbackTags,
    publishEvent,
    type ImageMetadataInput,
  } from '$lib/nostr/publish';

  const servers = [
    'https://blossom.primal.net/',
    'https://cdn.satellite.earth/',
    'https://blossom.band/'
  ];

  type LicensePreset = {
    id: string;
    canonical: string;
    label: string;
    licenseLabel: string;
  };

  const NO_LICENSE_ID = 'none';
  const CUSTOM_LICENSE_ID = 'custom';
  const LICENSE_PRESETS: LicensePreset[] = [
    {
      id: 'cc-by-4.0',
      canonical: 'https://creativecommons.org/licenses/by/4.0/',
      label: 'CC BY 4.0',
      licenseLabel: 'CC-BY-4.0',
    },
    {
      id: 'cc-by-sa-4.0',
      canonical: 'https://creativecommons.org/licenses/by-sa/4.0/',
      label: 'CC BY-SA 4.0',
      licenseLabel: 'CC-BY-SA-4.0',
    },
    {
      id: 'cc0-1.0',
      canonical: 'https://creativecommons.org/publicdomain/zero/1.0/',
      label: 'CC0 1.0 (Public Domain)',
      licenseLabel: 'CC0-1.0',
    },
    {
      id: 'pdm-1.0',
      canonical: 'https://creativecommons.org/publicdomain/mark/1.0/',
      label: 'Public Domain Mark 1.0',
      licenseLabel: 'PDM-1.0',
    },
    {
      id: 'mit',
      canonical: 'https://opensource.org/licenses/MIT',
      label: 'MIT License',
      licenseLabel: 'MIT',
    },
  ];

  let signer: SignerAdapter | null = null;
  let bunkerUrl = $state('');
  let relayUrl = $state('wss://relay.damus.io');
  let uploadUrl = $state('');
  let uploadUrlInput: HTMLInputElement | null = null;
  let eventContent = $state('');
  let status = $state('Not connected');
  let tiptapHost: HTMLDivElement | null = null;
  let tiptapEditor: Editor | null = null;
  let tiptapHtml = $state('');
  let metadataDialogOpen = $state(false);
  let metadataDialogFileName = $state('');
  let metadataDescription = $state('');
  let metadataAltAttribution = $state('');
  let metadataAuthor = $state('');
  let metadataLicenseChoice = $state(NO_LICENSE_ID);
  let metadataCustomLicenseSpec = $state('');
  let metadataKeywords = $state('');
  let metadataValidationError = $state('');
  let metadataDialogTitle = $state('Bild-Metadaten');
  let metadataDialogSubmitLabel = $state('Metadaten speichern');
  let metadataDialogImageUrl = $state('');
  let metadataSuggestLoading = $state(false);
  let metadataSuggestError = $state('');
  let metadataVisionChangedDescription = $state(false);
  let metadataVisionChangedAlt = $state(false);
  let metadataVisionChangedKeywords = $state(false);
  let metadataResolver: ((value: ImageMetadataInput | null) => void) | null = null;
  let uploadTagsByUrl = $state<Record<string, string[][]>>({});
  let sourceAuthor = $state('');
  let sourceLicenseChoice = $state(NO_LICENSE_ID);
  let sourceCustomLicenseSpec = $state('');
  const imageDescriberUrl =
    (import.meta.env.VITE_IMAGE_DESCRIBER_URL as string | undefined) ??
    (import.meta.env.PUBLIC_IMAGE_DESCRIBER_URL as string | undefined) ??
    '';

  function getVisionDescribeEndpoint() {
    const configured = imageDescriberUrl.trim();
    if (!configured) {
      throw new Error('VITE_IMAGE_DESCRIBER_URL is required. Local vision endpoint is disabled.');
    }

    const normalized = configured.replace(/\/$/, '');
    if (/\/describe$/i.test(normalized) || /\/api\/vision\/describe$/i.test(normalized)) {
      return normalized;
    }

    return `${normalized}/describe`;
  }

  function toKeywords(value: string) {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function fileNameFallback(file: File) {
    return file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  }

  function collectInitialMetadata(file: File): ImageMetadataInput {
    const dataset = uploadUrlInput?.dataset;
    const fallback = fileNameFallback(file);
    const description = dataset?.metadataDescription?.trim() || fallback || 'Uploaded image';
    const altAttribution = dataset?.metadataAltAttribution?.trim() || description || 'Uploaded image';
    const sourceLicense = getLicenseFromChoice(sourceLicenseChoice, sourceCustomLicenseSpec);
    const parsedDatasetLicense = parseLicenseSpec(dataset?.metadataLicense?.trim() || '');
    const parsedLicense = sourceLicense.canonical ? sourceLicense : parsedDatasetLicense;

    return {
      description,
      altAttribution,
      author: sourceAuthor.trim() || dataset?.metadataAuthor?.trim() || '',
      license: parsedLicense.canonical,
      licenseLabel: parsedLicense.label,
      keywords: toKeywords(dataset?.metadataKeywords || ''),
    };
  }

  function getLicenseFromChoice(choice: string, customSpec: string) {
    if (choice === NO_LICENSE_ID) {
      return { canonical: '', label: '' };
    }

    if (choice === CUSTOM_LICENSE_ID) {
      return parseLicenseSpec(customSpec);
    }

    const preset = LICENSE_PRESETS.find((item) => item.id === choice);
    if (!preset) {
      return { canonical: '', label: '' };
    }

    return {
      canonical: preset.canonical,
      label: preset.licenseLabel,
    };
  }

  function parseLicenseSpec(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      return { canonical: '', label: '' };
    }

    const pipeIndex = normalized.indexOf('|');
    if (pipeIndex < 0) {
      return { canonical: normalized, label: '' };
    }

    const canonical = normalized.slice(0, pipeIndex).trim();
    const label = normalized.slice(pipeIndex + 1).trim();
    return { canonical, label };
  }

  function toLicenseSpec(canonical: string, label: string) {
    if (!canonical) {
      return '';
    }

    if (!label) {
      return canonical;
    }

    return `${canonical}|${label}`;
  }

  function resolveLicenseChoice(metadata?: ImageMetadataInput) {
    const canonical = metadata?.license?.trim() ?? '';
    const label = metadata?.licenseLabel?.trim() ?? '';

    if (!canonical) {
      return {
        choice: NO_LICENSE_ID,
        customSpec: '',
        canonical: '',
        label: '',
      };
    }

    const preset = LICENSE_PRESETS.find((item) => item.canonical === canonical);
    if (preset) {
      return {
        choice: preset.id,
        customSpec: '',
        canonical: preset.canonical,
        label: label || preset.licenseLabel,
      };
    }

    return {
      choice: CUSTOM_LICENSE_ID,
      customSpec: toLicenseSpec(canonical, label),
      canonical,
      label,
    };
  }

  function formatLicenseDisplay(metadata?: { license?: string; licenseLabel?: string }) {
    const canonical = metadata?.license?.trim() || '';
    const label = metadata?.licenseLabel?.trim() || '';

    if (!canonical) {
      return '—';
    }

    return label ? `${label} (${canonical})` : canonical;
  }

  function resolveMetadataDialog(value: ImageMetadataInput | null) {
    const resolver = metadataResolver;
    metadataResolver = null;
    metadataDialogOpen = false;
    metadataValidationError = '';

    if (resolver) {
      resolver(value);
    }
  }

  function openMetadataDialog(
    fileName: string,
    options?: {
      mode?: 'create' | 'edit';
      initialMetadata?: ImageMetadataInput;
      imageUrl?: string;
    },
  ): Promise<ImageMetadataInput | null> {
    metadataDialogFileName = fileName;
    metadataDialogImageUrl = options?.imageUrl ?? '';
    metadataDescription = options?.initialMetadata?.description ?? '';
    metadataAltAttribution = options?.initialMetadata?.altAttribution ?? '';
    metadataAuthor = options?.initialMetadata?.author ?? '';
    metadataKeywords = options?.initialMetadata?.keywords?.join(', ') ?? '';
    const licenseChoice = resolveLicenseChoice(options?.initialMetadata);
    metadataLicenseChoice = licenseChoice.choice;
    metadataCustomLicenseSpec = licenseChoice.customSpec;
    metadataValidationError = '';
    metadataSuggestError = '';
    metadataSuggestLoading = false;
    metadataVisionChangedDescription = false;
    metadataVisionChangedAlt = false;
    metadataVisionChangedKeywords = false;
    metadataDialogTitle = options?.mode === 'edit' ? 'Metadaten bearbeiten' : 'Bild-Metadaten';
    metadataDialogSubmitLabel = options?.mode === 'edit' ? 'Metadaten aktualisieren' : 'Metadaten speichern';
    metadataDialogOpen = true;

    return new Promise((resolve) => {
      metadataResolver = resolve;
    });
  }

  function cancelMetadataDialog() {
    resolveMetadataDialog(null);
  }

  async function suggestDescriptionFromVision() {
    if (!metadataDialogImageUrl) {
      metadataSuggestError = 'Kein Bild für Vision-Beschreibung verfügbar.';
      return;
    }

    metadataSuggestLoading = true;
    metadataSuggestError = '';

    try {
      const endpoint = getVisionDescribeEndpoint();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: metadataDialogImageUrl }),
      });

      const payload = (await response.json()) as {
        description?: string;
        alt?: string;
        tags?: string[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Vision request failed');
      }

      if (payload.description?.trim()) {
        const nextDescription = payload.description.trim();
        metadataVisionChangedDescription = nextDescription !== metadataDescription;
        metadataDescription = nextDescription;
      }

      if (payload.alt?.trim()) {
        const nextAlt = payload.alt.trim();
        metadataVisionChangedAlt = nextAlt !== metadataAltAttribution;
        metadataAltAttribution = nextAlt;
      }

      if (!metadataKeywords.trim() && payload.tags?.length) {
        const nextKeywords = payload.tags.join(', ');
        metadataVisionChangedKeywords = nextKeywords !== metadataKeywords;
        metadataKeywords = nextKeywords;
      }
    } catch (error) {
      metadataSuggestError = error instanceof Error ? error.message : 'Vision request failed';
    } finally {
      metadataSuggestLoading = false;
    }
  }

  function submitMetadataDialog() {
    const description = metadataDescription.trim();
    const altAttribution = metadataAltAttribution.trim();

    if (!description || !altAttribution) {
      metadataValidationError = 'Beschreibung und Alt-Attribution sind Pflichtfelder.';
      return;
    }

    let license = '';
    let licenseLabel = '';

    if (metadataLicenseChoice === CUSTOM_LICENSE_ID) {
      if (!metadataCustomLicenseSpec.includes('|')) {
        metadataValidationError = 'Für "andere Lizenz" bitte das Format uri|label verwenden.';
        return;
      }

      const parsed = parseLicenseSpec(metadataCustomLicenseSpec);
      if (!parsed.canonical || !parsed.label) {
        metadataValidationError = 'Für "andere Lizenz" sind sowohl URI/Code als auch Label erforderlich.';
        return;
      }

      license = parsed.canonical;
      licenseLabel = parsed.label;
    } else if (metadataLicenseChoice !== NO_LICENSE_ID) {
      const preset = LICENSE_PRESETS.find((item) => item.id === metadataLicenseChoice);
      if (!preset) {
        metadataValidationError = 'Ungültige Lizenzauswahl.';
        return;
      }

      license = preset.canonical;
      licenseLabel = preset.licenseLabel;
    }

    resolveMetadataDialog({
      description,
      altAttribution,
      author: metadataAuthor.trim(),
      license,
      licenseLabel,
      keywords: metadataKeywords
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    });
  }

  function getCurrentUploadItem() {
    if (!uploadUrl) {
      return null;
    }

    return $uploadHistoryStore.find((item) => item.url === uploadUrl) ?? null;
  }

  async function onEditCurrentUploadMetadata() {
    if (!uploadUrl) {
      status = 'No uploaded URL available';
      return;
    }

    if (!signer) {
      status = 'Login required before metadata update';
      return;
    }

    const currentItem = getCurrentUploadItem();
    const initialMetadata: ImageMetadataInput = currentItem?.metadata ?? {
      description: '',
      altAttribution: '',
      author: '',
      license: '',
      licenseLabel: '',
      keywords: [],
    };

    const metadata = await openMetadataDialog(uploadUrl, {
      mode: 'edit',
      initialMetadata,
      imageUrl: uploadUrl,
    });

    if (!metadata) {
      status = 'Metadata update canceled';
      return;
    }

    const fallbackTags: string[][] = [
      ['url', uploadUrl],
      ...(currentItem?.mime ? [['m', currentItem.mime]] : []),
    ];
    const uploadTags = uploadTagsByUrl[uploadUrl] ?? fallbackTags;

    const kind1063Tags = buildImageMetadataTags(uploadTags, metadata);
    const kind1Tags = buildKind1FallbackTags(uploadTags, metadata);

    await publishEvent(signer, relayUrl, metadata.description, kind1063Tags, 1063);
    await publishEvent(signer, relayUrl, metadata.description, kind1Tags, 1);

    updateLatestUploadHistoryByUrl(uploadUrl, {
      metadata,
      publishedKinds: [1063, 1],
    });
    status = 'Metadata updated and republished as kind 1063 + kind 1';
  }

  onMount(() => {
    if (!tiptapHost) {
      return;
    }

    tiptapEditor = new Editor({
      element: tiptapHost,
      extensions: [StarterKit, Image, BlossomExtension],
      content: '<p>Write your note and attach uploads via Blossom.</p>',
      onUpdate: ({ editor }) => {
        tiptapHtml = editor.getHTML();
      },
    });

    tiptapHtml = tiptapEditor.getHTML();

    return () => {
      tiptapEditor?.destroy();
      tiptapEditor = null;
    };
  });

  $effect(() => {
    if ($authStore.method !== 'nip46') {
      return;
    }

    if ($authStore.sessionStatus === 'connecting') {
      status = $authStore.sessionInfo ?? 'Connecting to NIP-46 bunker...';
      return;
    }

    if ($authStore.sessionStatus === 'error') {
      status = $authStore.sessionInfo ?? 'NIP-46 connection failed';
      return;
    }
  });

  async function loginNip07() {
    try {
      signer = await connectNip07Signer();
      status = 'Connected via NIP-07';
    } catch (error) {
      status = error instanceof Error ? error.message : 'Login failed';
    }
  }

  async function loginNip46() {
    try {
      status = 'Connecting via NIP-46...';
      signer = await connectNip46Signer(bunkerUrl);
      status = 'Connected via NIP-46';
    } catch (error) {
      signer = null;
      status = error instanceof Error ? error.message : 'Login failed';
    }
  }

  async function selectUploadUrl() {
    if (!signer) {
      status = 'Login required before upload';
      return null;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';

    const file = await new Promise<File | null>((resolve) => {
      input.addEventListener('change', () => {
        resolve(input.files?.item(0) ?? null);
      });
      input.click();
    });

    if (!file) {
      return null;
    }

    const bridge = createBlossomBridge({
      servers,
      signer,
    });

    try {
      const result = await bridge.uploadFile(file);
      const uploadTags = result.tags.map((tag) => [...tag]);
      const mime = uploadTags.find((tag) => tag[0] === 'm')?.[1];
      uploadTagsByUrl = {
        ...uploadTagsByUrl,
        [result.url]: uploadTags,
      };

      uploadUrl = result.url;

      if (!mime?.startsWith('image/')) {
        addUploadHistory({ url: result.url, mime, createdAt: new Date().toISOString() });
        status = 'Upload success';
        return result.url;
      }

      const metadata = await openMetadataDialog(file.name, {
        mode: 'create',
        initialMetadata: collectInitialMetadata(file),
        imageUrl: result.url,
      });
      if (!metadata) {
        status = 'Upload completed, but metadata entry was canceled';
        return null;
      }

      const kind1063Tags = buildImageMetadataTags(uploadTags, metadata);
      const kind1Tags = buildKind1FallbackTags(uploadTags, metadata);

      await publishEvent(signer, relayUrl, metadata.description, kind1063Tags, 1063);
      await publishEvent(signer, relayUrl, metadata.description, kind1Tags, 1);

      addUploadHistory({
        url: result.url,
        mime,
        createdAt: new Date().toISOString(),
        metadata,
        publishedKinds: [1063, 1],
      });

      status = 'Upload success. Metadata published as kind 1063 + kind 1';
      return result.url;
    } catch (error) {
      if (error instanceof AggregateError) {
        status =
          'Upload failed on all servers (possible CORS or auth event rejection). Try another Blossom server.';
        return null;
      }

      if (error instanceof Error) {
        status = `Upload failed: ${error.message}`;
        return null;
      }

      status = 'Upload failed with unknown error';
      return null;
    }
  }

  async function onPublish() {
    if (!signer) {
      status = 'Login required before publish';
      return;
    }

    const tags = uploadUrl ? [['url', uploadUrl]] : [];
    const result = await publishEvent(signer, relayUrl, eventContent, tags, 1);
    status = `Event prepared for ${result.relayUrl}`;
  }

  async function uploadForTiptap(): Promise<BlossomMediaPayload | null> {
    const url = await selectUploadUrl();
    if (!url) {
      return null;
    }

    const lastHistoryItem = $uploadHistoryStore[0];

    return {
      url,
      mimeType: lastHistoryItem?.mime,
    };
  }

  async function onTiptapUpload() {
    if (!tiptapEditor) {
      status = 'TipTap editor not ready';
      return;
    }

    const inserted = await uploadAndInsertBlossomMedia(
      tiptapEditor as unknown as TiptapInsertMediaEditor,
      uploadForTiptap,
    );
    if (!inserted) {
      status = 'TipTap upload canceled';
      return;
    }

    tiptapHtml = tiptapEditor.getHTML();
    status = 'TipTap content updated';
  }

  function disconnectSigner() {
    signer?.disconnect?.();
    signer = null;
    status = 'Disconnected';
  }
</script>

<main>
  <h1>Blossom Plugin Demo</h1>
  <p>{status}</p>

  <section>
    <h2>Login</h2>
    <p>
      Auth: {$authStore.method ?? 'none'} | Session: {$authStore.sessionStatus}
      {#if $authStore.pubkey} | Pubkey: {$authStore.pubkey}{/if}
      {#if $authStore.sessionInfo} | Info: {$authStore.sessionInfo}{/if}
    </p>
    {#if $authStore.nip46ParsedRelays.length > 0}
      <p>NIP-46 parsed relays: {$authStore.nip46ParsedRelays.join(', ')}</p>
    {/if}
    {#if $authStore.nip46ActiveRelays.length > 0}
      <p>NIP-46 active relays: {$authStore.nip46ActiveRelays.join(', ')}</p>
    {/if}
    <button type="button" onclick={loginNip07}>Connect NIP-07</button>
    <input bind:value={bunkerUrl} placeholder="bunker://..." />
    <button type="button" onclick={loginNip46}>Connect NIP-46</button>
    <button type="button" onclick={disconnectSigner}>Disconnect</button>
  </section>

  <section>
    <h2>Input + Upload Injection</h2>
    <input
      bind:this={uploadUrlInput}
      bind:value={uploadUrl}
      placeholder="https://..."
      use:useBlossomInput={{ onSelectUrl: selectUploadUrl, iconLabel: 'Upload with Blossom' }}
    />

    <div class="metadata-source">
      <h3>Default Metadata Source (Autor/Lizenz)</h3>
      <input bind:value={sourceAuthor} placeholder="Autor (Auto-Fill)" />
      <label>
        Lizenz (Auto-Fill)
        <select bind:value={sourceLicenseChoice}>
          <option value={NO_LICENSE_ID}>Keine Lizenz</option>
          {#each LICENSE_PRESETS as preset}
            <option value={preset.id}>{preset.label}</option>
          {/each}
          <option value={CUSTOM_LICENSE_ID}>Andere Lizenz</option>
        </select>
      </label>
      {#if sourceLicenseChoice === CUSTOM_LICENSE_ID}
        <input bind:value={sourceCustomLicenseSpec} placeholder="uri|label" />
      {/if}
    </div>

    {#if uploadUrl}
      {@const currentUploadItem = getCurrentUploadItem()}
      {#if currentUploadItem?.mime?.startsWith('image/')}
        <div class="metadata-target">
          <h3>Bildvorschau & Metadaten</h3>
          <img
            class="upload-preview"
            src={uploadUrl}
            alt={
              currentUploadItem.metadata?.altAttribution ||
              currentUploadItem.metadata?.description ||
              'Uploaded image preview'
            }
          />
          <p>
            <strong>Beschreibung:</strong>
            {currentUploadItem.metadata?.description ?? 'Noch nicht erfasst'}
          </p>
          <p>
            <strong>Alt-Attribution:</strong>
            {currentUploadItem.metadata?.altAttribution ?? 'Noch nicht erfasst'}
          </p>
          <p><strong>Autor:</strong> {currentUploadItem.metadata?.author || '—'}</p>
          <p><strong>Lizenz:</strong> {formatLicenseDisplay(currentUploadItem.metadata)}</p>
          <p>
            <strong>Keywords:</strong>
            {currentUploadItem.metadata?.keywords?.length
              ? currentUploadItem.metadata.keywords.join(', ')
              : '—'}
          </p>
          <button type="button" onclick={onEditCurrentUploadMetadata}>Metadaten bearbeiten</button>
        </div>
      {/if}
    {/if}
  </section>

  <section>
    <h2>Event Composer</h2>
    <input bind:value={relayUrl} placeholder="wss://relay.example" />
    <textarea bind:value={eventContent} placeholder="Write your nostr event"></textarea>
    <button type="button" onclick={onPublish}>Publish</button>
  </section>

  <section>
    <h2>TipTap + Blossom</h2>
    <button type="button" onclick={onTiptapUpload}>Upload into TipTap</button>
    <div class="editor" bind:this={tiptapHost}></div>
    <textarea readonly value={tiptapHtml}></textarea>
  </section>

  <section>
    <h2>Upload History</h2>
    <ul>
      {#each $uploadHistoryStore as item (item.createdAt + item.url)}
        <li>
          {item.url} ({item.mime ?? 'unknown'})
          {#if item.publishedKinds?.length}
            | kinds: {item.publishedKinds.join(', ')}
          {/if}
          {#if item.metadata}
            | desc: {item.metadata.description} | alt: {item.metadata.altAttribution}
            {#if item.metadata.author} | author: {item.metadata.author}{/if}
            {#if item.metadata.license} | license: {formatLicenseDisplay(item.metadata)}{/if}
            {#if item.metadata.keywords.length > 0}
              | keywords: {item.metadata.keywords.join(', ')}
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  {#if metadataDialogOpen}
    <div class="dialog-backdrop" role="presentation">
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-dialog-title"
      >
        <h2 id="metadata-dialog-title">{metadataDialogTitle}</h2>
        <p>Datei: {metadataDialogFileName}</p>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            submitMetadataDialog();
          }}
        >
          <label>
            Beschreibung *
            <textarea
              bind:value={metadataDescription}
              rows="3"
              required
              class:vision-updated={metadataVisionChangedDescription}
            ></textarea>
          </label>
          <button
            type="button"
            onclick={suggestDescriptionFromVision}
            disabled={metadataSuggestLoading}
          >
            {metadataSuggestLoading
              ? 'Vision analysiert Bild...'
              : 'Kurzbeschreibung per Vision vorschlagen'}
          </button>
          {#if metadataSuggestError}
            <p class="dialog-error">{metadataSuggestError}</p>
          {/if}
          <label>
            Alt-Attribution *
            <input bind:value={metadataAltAttribution} required class:vision-updated={metadataVisionChangedAlt} />
          </label>
          <label>
            Autor
            <input bind:value={metadataAuthor} />
          </label>
          <label>
            Lizenz
            <select bind:value={metadataLicenseChoice}>
              <option value={NO_LICENSE_ID}>Keine Lizenz</option>
              {#each LICENSE_PRESETS as preset}
                <option value={preset.id}>{preset.label}</option>
              {/each}
              <option value={CUSTOM_LICENSE_ID}>Andere Lizenz</option>
            </select>
          </label>
          {#if metadataLicenseChoice === CUSTOM_LICENSE_ID}
            <label>
              Andere Lizenz (uri|label)
              <input bind:value={metadataCustomLicenseSpec} placeholder="https://example.com/license|Custom License" />
            </label>
          {/if}
          <label>
            Keywords
            <input
              bind:value={metadataKeywords}
              placeholder="nostr, blossom, photo"
              class:vision-updated={metadataVisionChangedKeywords}
            />
          </label>

          {#if metadataValidationError}
            <p class="dialog-error">{metadataValidationError}</p>
          {/if}

          <div class="dialog-actions">
            <button type="button" onclick={cancelMetadataDialog}>Abbrechen</button>
            <button type="submit">{metadataDialogSubmitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</main>

<style>
  main {
    max-width: 920px;
    margin: 0 auto;
    padding: 2rem;
    display: grid;
    gap: 1rem;
  }

  section {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    display: grid;
    gap: 0.5rem;
  }

  .editor {
    border: 1px solid #ccc;
    border-radius: 6px;
    min-height: 140px;
    padding: 0.75rem;
    background: #fff;
  }

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .dialog {
    width: min(640px, 100%);
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 1rem;
    display: grid;
    gap: 0.75rem;
  }

  .dialog form {
    display: grid;
    gap: 0.75rem;
  }

  .dialog label {
    display: grid;
    gap: 0.35rem;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .dialog-error {
    margin: 0;
  }

  .vision-updated {
    border-width: 2px;
    outline: 2px dashed currentColor;
    outline-offset: 1px;
  }

  .metadata-target {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 0.75rem;
    display: grid;
    gap: 0.5rem;
  }

  .metadata-source {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 0.75rem;
    display: grid;
    gap: 0.5rem;
  }

  .metadata-source h3 {
    margin: 0;
  }

  .metadata-target h3,
  .metadata-target p {
    margin: 0;
  }

  .upload-preview {
    max-width: 320px;
    width: 100%;
    border-radius: 8px;
    border: 1px solid #ddd;
  }

  input,
  textarea,
  button {
    font: inherit;
    padding: 0.5rem;
  }
</style>
