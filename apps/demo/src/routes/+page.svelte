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
  import { addUploadHistory, uploadHistoryStore } from '$lib/stores/uploads';
  import { connectNip07Signer, connectNip46Signer } from '$lib/nostr/signers';
  import type { SignerAdapter } from '$lib/nostr/signers';
  import { publishEvent } from '$lib/nostr/publish';

  const servers = [
    'https://blossom.primal.net/',
    'https://cdn.satellite.earth/',
    'https://blossom.band/'
  ];

  let signer: SignerAdapter | null = null;
  let bunkerUrl = $state('');
  let relayUrl = $state('wss://relay.damus.io');
  let uploadUrl = $state('');
  let eventContent = $state('');
  let status = $state('Not connected');
  let tiptapHost: HTMLDivElement | null = null;
  let tiptapEditor: Editor | null = null;
  let tiptapHtml = $state('');

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
      const mime = result.tags.find((tag: [string, string]) => tag[0] === 'm')?.[1];
      addUploadHistory({ url: result.url, mime, createdAt: new Date().toISOString() });
      status = 'Upload success';
      uploadUrl = result.url;
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
    const result = await publishEvent(signer, relayUrl, eventContent, tags);
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
      bind:value={uploadUrl}
      placeholder="https://..."
      use:useBlossomInput={{ onSelectUrl: selectUploadUrl, iconLabel: 'Upload with Blossom' }}
    />
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
        <li>{item.url} ({item.mime ?? 'unknown'})</li>
      {/each}
    </ul>
  </section>
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

  input,
  textarea,
  button {
    font: inherit;
    padding: 0.5rem;
  }
</style>
