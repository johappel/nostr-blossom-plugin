# 01: URL Input Client (minimal)

```svelte
<script lang="ts">
  import { createBlossomBridge } from '@blossom/plugin';

  const servers = ['https://blossom.primal.net/'];
  const signer = await connectYourSigner();

  const bridge = createBlossomBridge({ servers, signer });
  let url = $state('');

  async function onUpload() {
    const result = await bridge.selectAndUpload({ accept: 'image/*,application/pdf' });
    if (result) {
      url = result.url;
    }
  }
</script>

<input bind:value={url} placeholder="https://..." />
<button type="button" onclick={onUpload}>Upload</button>
```

Optional statt eigenem Button:

```ts
const input = document.querySelector('#upload-url') as HTMLInputElement;
bridge.attachToInput(input, { iconLabel: 'Upload with Blossom' });
```
