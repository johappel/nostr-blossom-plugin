# Blossom Plugin Monorepo

Monorepo für ein Blossom-Upload-Plugin und einen Svelte-Demo-Client für Nostr.

## Pakete

- `packages/blossom-plugin`: Headless Upload-Client, Svelte Input-Action, TipTap Helper.
- `apps/demo`: Demo-App mit NIP-07/NIP-46 Login, Upload, URL-Übernahme und Event-Publish.

## Quickstart

```bash
pnpm install
pnpm dev
```

## Skripte

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Plugin Usage

### Headless Upload API

```ts
import { createBlossomUploadClient } from '@blossom/plugin';

const client = createBlossomUploadClient({
  servers: ['https://blossom.primal.net/'],
  signer,
});

const result = await client.upload(file);
console.log(result.url, result.tags);
```

### Svelte Input Action

```svelte
<script lang="ts">
  import { useBlossomInput } from '@blossom/plugin';

  async function onSelectUrl() {
    return 'https://example.com/image.png';
  }
</script>

<input use:useBlossomInput={{ onSelectUrl, iconLabel: 'Upload with Blossom' }} />
```

## Komponenten-Dokumentation (MVP)

### `useBlossomInput`

- Zweck: Ergänzt ein bestehendes `input` mit Upload-Button und schreibt die gewählte URL zurück.
- API:
  - `onSelectUrl: () => Promise<string | null>`
  - `iconLabel?: string`
- Zustände: idle, selecting, selected/cancelled.
- Fehlerverhalten: Fehler im Upload-Flow werden in der Host-App behandelt.

### `createBlossomUploadClient`

- Zweck: Upload zu Blossom-Servern und Rückgabe von normalisierten NIP-94 Tags.
- API:
  - `servers: string[]`
  - `signer: unknown` (NIP-07/NIP-46 kompatibel)
  - `expiresIn?: number`
- Rückgabe:
  - `tags: [string, string][]`
  - `url: string`
- Validierung: Fehlt `url` in den Tags, wird ein Fehler geworfen.
