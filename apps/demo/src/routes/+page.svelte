<script lang="ts">
  import { createBlossomUploadClient, useBlossomInput } from '@blossom/plugin';
  import { addUploadHistory, uploadHistoryStore } from '$lib/stores/uploads';
  import { connectNip07Signer, connectNip46Signer } from '$lib/nostr/signers';
  import { publishEvent } from '$lib/nostr/publish';

  const servers = [
    'https://blossom.primal.net/',
    'https://cdn.satellite.earth/',
  ];

  let signer: Awaited<ReturnType<typeof connectNip07Signer>> | null = null;
  let bunkerUrl = '';
  let relayUrl = 'wss://relay.damus.io';
  let uploadUrl = '';
  let eventContent = '';
  let status = 'Not connected';

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
      signer = await connectNip46Signer(bunkerUrl);
      status = 'Connected via NIP-46';
    } catch (error) {
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

    const client = createBlossomUploadClient({
      servers,
      signer,
    });

    const result = await client.upload(file);
    const mime = result.tags.find((tag: [string, string]) => tag[0] === 'm')?.[1];
    addUploadHistory({ url: result.url, mime, createdAt: new Date().toISOString() });
    status = 'Upload success';
    uploadUrl = result.url;
    return result.url;
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
</script>

<main>
  <h1>Blossom Plugin Demo</h1>
  <p>{status}</p>

  <section>
    <h2>Login</h2>
    <button type="button" on:click={loginNip07}>Connect NIP-07</button>
    <input bind:value={bunkerUrl} placeholder="bunker://..." />
    <button type="button" on:click={loginNip46}>Connect NIP-46</button>
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
    <button type="button" on:click={onPublish}>Publish</button>
  </section>

  <section>
    <h2>Upload History</h2>
    <ul>
      {#each $uploadHistoryStore as item}
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

  input,
  textarea,
  button {
    font: inherit;
    padding: 0.5rem;
  }
</style>
