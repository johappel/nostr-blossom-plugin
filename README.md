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

## Demo `.env` konfigurieren

Die Demo nutzt Vision-Beschreibung ausschließlich über den externen `image-describer` Service.

```powershell
Copy-Item apps/demo/.env.example apps/demo/.env
```

In `apps/demo/.env` muss gesetzt sein:

- `VITE_IMAGE_DESCRIBER_URL=http://localhost:8787`

Start dann am besten gezielt die Demo:

```bash
pnpm --filter demo dev
```

## Image Describer als Docker-Service

Die Vision-Logik läuft als separater Service.

1. Service-Env anlegen:

```powershell
Copy-Item apps/image-describer/.env.example apps/image-describer/.env
```

2. In `apps/image-describer/.env` mindestens `OPENROUTER_API_KEY` setzen.

3. Service starten:

```bash
docker compose up -d image-describer
```

4. Demo auf Service zeigen (`apps/demo/.env`):

- `VITE_IMAGE_DESCRIBER_URL=http://localhost:8787`

Dann ruft die Demo `POST /describe` auf dem Container auf.

## Fokus: Unknown Client Integration

- Kurzleitfaden für die minimale Host-Integration: [docs/simple-integration.md](docs/simple-integration.md)
- Reduzierte Copy/Paste-Beispiele: [docs/examples/README.md](docs/examples/README.md)
- Dist-Integrationsleitfaden pro Bereich: [docs/dist/README.md](docs/dist/README.md)

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

### Dead Simple Upload API (empfohlen)

```ts
import { createBlossomBridge } from '@blossom/plugin';

const bridge = createBlossomBridge({
  servers: ['https://blossom.primal.net/'],
  signer, // BlossomSigner: { getPublicKey, signEvent }
});

const result = await bridge.selectAndUpload({ accept: 'image/*,application/pdf' });
if (result) {
  console.log(result.url, result.tags);
}
```

Nur Core importieren (ohne Svelte/TipTap APIs):

```ts
import { createBlossomBridge } from '@blossom/plugin/core';
```

Für Host-Inputs ohne Svelte-Action:

```ts
const input = document.querySelector('#upload-url') as HTMLInputElement;
const handle = bridge.attachToInput(input, { iconLabel: 'Upload with Blossom' });

// später optional:
handle.destroy();
```

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
- Nach Bild-Uploads fragt die Demo Metadaten ab und publiziert diese als kind `1063` plus kind `1` Fallback.
- Rückgabe:
  - `tags: [string, string, ...string[]][]`
  - `url: string`
- Validierung: Fehlt `url` in den Tags, wird ein Fehler geworfen.

### `createBlossomBridge`

- Zweck: Sehr einfache Integrationsschicht für unbekannte Host-Clients.
- API:
  - `uploadFile(file)`
  - `selectAndUpload({ accept? })`
  - `attachToInput(input, { iconLabel?, buttonText?, accept? })`
- Zustände: idle, selecting, uploading, success/error (vom Host via Promise-Handling steuerbar).
- Fehlerverhalten: Upload-Fehler werden unverändert durchgereicht.
