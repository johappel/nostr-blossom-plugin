# Blossom Plugin Monorepo

Monorepo für ein einbettbares Blossom-Media-Widget und Nostr-Upload-Plugin.

## Pakete / Apps

| Pfad | Beschreibung |
|---|---|
| `packages/blossom-plugin` | Plugin-Kern: Upload-Client, Svelte Action, TipTap Helper, **Media Widget** |
| `apps/image-describer` | KI-Vision-Service (Fastify) für AI-gestützte Metadaten-Vorschläge |
| `examples/` | Eigenständige HTML-Beispiele für die Widget-Einbettung |

## Quickstart

```bash
pnpm install
pnpm build:widget   # baut dist/widget/blossom-media.{iife,esm}.js
```

Dann direkt `examples/simple-input.html` im Browser öffnen.

## Widget einbetten

### Variante A — Auto-Init (kein JS nötig)

```html
<input type="text" data-blossom name="imageUrl" />

<script
  src="blossom-media.iife.js"
  data-blossom-config='{
    "servers": ["https://blossom.primal.net"],
    "relayUrl": "wss://relay.damus.io"
  }'
></script>
```

Felder mit `data-blossom` erhalten automatisch einen **🌸 Mediathek**-Button.  
Nach Auswahl wird die URL direkt ins Feld geschrieben.

### Variante B — Manuelles Init

```js
const media = window.BlossomMedia.init({
  servers: ['https://blossom.primal.net'],
  relayUrl: 'wss://relay.damus.io',
  visionEndpoint: 'http://localhost:8787',  // optional: KI-Beschreibung
  onInsert: (result, targetElement) => {
    console.log('Eingefügt:', result.url);
  },
});

// Programmatisch öffnen:
media.open(document.querySelector('#upload-input'));
```

### ESM-Import

```js
import { init } from '@blossom/plugin/widget';

const media = init({ servers: ['https://blossom.primal.net'] });
```

## KI-Vision-Service (image-describer)

Für den KI-Vorschlag-Button im Metadaten-Dialog wird der `image-describer`-Service benötigt.

1. Env anlegen:

```powershell
Copy-Item apps/image-describer/.env.example apps/image-describer/.env
```

2. In `.env` mindestens `OPENROUTER_API_KEY` setzen.

3. Starten:

```bash
docker compose up -d image-describer
```

4. Widget-Konfiguration: `visionEndpoint: 'http://localhost:8787'`

## Build-Skripte

| Skript | Beschreibung |
|---|---|
| `pnpm build` | Alle Pakete bauen (tsc) |
| `pnpm build:widget` | Widget-Bundle bauen (IIFE + ESM) |
| `pnpm typecheck` | TypeScript-Check aller Pakete |
| `pnpm test` | Tests aller Pakete |

## Plugin-API (direkte Nutzung ohne Widget)

### Upload-Client

```ts
import { createBlossomBridge } from '@blossom/plugin';

const bridge = createBlossomBridge({
  servers: ['https://blossom.primal.net/'],
  signer, // { getPublicKey, signEvent }
});

const result = await bridge.selectAndUpload({ accept: 'image/*,application/pdf' });
if (result) console.log(result.url, result.tags);
```

### Svelte Input Action

```svelte
<input use:useBlossomInput={{ onSelectUrl, iconLabel: 'Upload' }} />
```

### TipTap Extension

```ts
import { BlossomExtension, uploadAndInsertBlossomMedia } from '@blossom/plugin';

const editor = new Editor({
  extensions: [StarterKit, Image, BlossomExtension],
});

await uploadAndInsertBlossomMedia(editor, async () => ({
  url: 'https://example.com/image.png',
  mimeType: 'image/png',
}));
```

## Dokumentation

- Vollständige Integrations-Referenz: [`integration.md`](integration.md)
- Einbettungsbeispiele: [`examples/`](examples/)


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
Sie unterstützt Upload-Beschreibungen für Bilder und PDFs (PDFs werden serverseitig als Mehrseiten-Vorschau gerendert und mit Textauszug analysiert).

1. Service-Env anlegen:

```powershell
Copy-Item apps/image-describer/.env.example apps/image-describer/.env
```

2. In `apps/image-describer/.env` mindestens `OPENROUTER_API_KEY` setzen.
  Optional: `OPENROUTER_RESPONSE_LANGUAGE` (Default: `German`) für die Sprache von `description`, `alt` und `genre`.
  Optional: `OPENROUTER_PDF_MAX_PAGES` (Default: `4`) und `OPENROUTER_PDF_TEXT_MAX_CHARS` (Default: `4500`) für PDF-Tiefe und Textkontext.

3. Service starten:

```bash
docker compose up -d image-describer
```

4. Demo auf Service zeigen (`apps/demo/.env`):

- `VITE_IMAGE_DESCRIBER_URL=http://localhost:8787`

Dann ruft die Demo `POST /describe` auf dem Container auf.
Im Metadaten-Dialog kann dadurch auch für `application/pdf` eine Kurzbeschreibung per Vision vorgeschlagen werden.

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
