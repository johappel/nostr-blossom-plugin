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

## Produktion lokal starten

```bash
pnpm build
pnpm start
```

## Skripte

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm start`

## Plugin Usage

### Headless Upload API

```ts
import { createBlossomUploadClient } from '@blossom/plugin';

const client = createBlossomUploadClient({
  servers: ['https://blossom.primal.net/'],
  signer, // BlossomSigner: { getPublicKey, signEvent }
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

### TipTap Extension

```ts
import { BlossomExtension, uploadAndInsertBlossomMedia } from '@blossom/plugin';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';

const editor = new Editor({
  element: document.querySelector('#editor'),
  extensions: [StarterKit, Image, BlossomExtension],
  content: '<p>Hello Blossom</p>',
});

await uploadAndInsertBlossomMedia(editor, async () => ({
  url: 'https://example.com/image.png',
  mimeType: 'image/png',
}));
```

Hinweis: Bei `image/*` wird ein Image-Node eingefügt, sonst ein normaler URL-Text.

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
  - `signer: BlossomSigner` (`getPublicKey` + `signEvent`, auth-agnostisch)
  - `expiresIn?: number`

### NIP-46 (Demo)

- Die Demo nutzt NDK für NIP-46-Sessions und Signierung.
- Das Plugin selbst bleibt auth-unabhängig und erwartet nur das `BlossomSigner`-Interface.
- Dadurch funktioniert Upload-Signierung gleich für NIP-07 und NIP-46.
- Rückgabe:
  - `tags: [string, string][]`
  - `url: string`
- Validierung: Fehlt `url` in den Tags, wird ein Fehler geworfen.
