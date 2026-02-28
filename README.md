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

### Ausgabeformat per `data-format`

Das Ausgabeformat wird vom Ziel-Element bestimmt, nicht vom Benutzer.
Per `data-format` Attribut legt das Host-Feld fest, in welchem Format der eingefügte Text formatiert wird:

| Element | Attribut | Format | Beispiel-Ausgabe |
|---|---|---|---|
| `<input data-blossom>` | _(keines)_ | `url` (Default) | `https://blossom.example/abc.webp` |
| `<textarea data-blossom data-format="markdown">` | `markdown` | Markdown | `![Beschreibung](url)` |
| `<div contenteditable data-blossom data-format="html">` | `html` | HTML | `<figure><img …><figcaption>…</figcaption></figure>` |
| `<pre data-blossom data-format="nostr-tag">` | `nostr-tag` | Nostr imeta | `["imeta", "url …", "m …", …]` |
| `<pre data-blossom data-format="json">` | `json` | JSON | `{ "url": "…", "mimeType": "…" }` |

```html
<!-- URL (default) -->
<input type="text" data-blossom name="imageUrl" />

<!-- Markdown -->
<textarea data-blossom data-format="markdown" name="content"></textarea>

<!-- HTML -->
<div contenteditable data-blossom data-format="html"></div>
```

> **Ohne Ziel-Element** (z. B. über das Bookmarklet) erscheint stattdessen ein
> Format-Dropdown in der Toolbar und der Text wird in die Zwischenablage kopiert.

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

## User Settings (Einstellungen)

Das Widget enthält ein integriertes Settings-Panel, erreichbar über das **👤 User-Icon** im Header.

### Funktionen

- **Login-Hinweise:** Informationen zu NIP-07 Browser-Extensions und NIP-46 Remote Signern (Bunker).
- **NIP-46 Bunker:** Eingabefeld für `bunker://`-URIs — erlaubt Login über Remote Signer wie [nsec.app](https://nsec.app) oder [nsecBunker](https://app.nsecbunker.com).
- **Profil:** Zeigt den verbundenen Nostr-Nutzer (Name, Avatar, NIP-05) readonly an.
- **Konfiguration:** Blossom-Server, Nostr-Relays und KI-Service-URL können vom Nutzer überschrieben werden.
- **Persistenz:** Einstellungen werden in `localStorage` gespeichert und optional als NIP-78-Event (Kind 30078) auf das Relay synchronisiert.

### `appId` (Multi-Instanz)

Wenn mehrere Widget-Instanzen auf derselben Seite unterschiedliche Settings benötigen:

```js
const media = window.BlossomMedia.init({
  servers: ['https://blossom.primal.net'],
  appId: 'my-unique-app',  // scoped localStorage key
});
```

### Signer-Priorität

1. **NIP-46 Bunker** (wenn `bunkerUri` in Settings gesetzt)
2. **`config.signer`** (vom Host übergeben)
3. **`window.nostr`** (NIP-07 Browser-Extension, auto-detected)

## KI-Service (image-describer)

Der `image-describer`-Service stellt zwei KI-Funktionen bereit:

- **Bildbeschreibung** (`POST /describe`) – generiert Alt-Text, Genre und Tags via Vision-LLM
- **Bildgenerierung** (`POST /image-gen`) – erstellt Bilder aus Textprompts via OpenAI-kompatible API

**Schnellstart:**

```bash
cp apps/image-describer/.env.example apps/image-describer/.env
# → .env öffnen, mindestens OPENROUTER_API_KEY setzen
docker compose up -d image-describer
```

Widget-Konfiguration: `visionEndpoint: 'http://localhost:8787'`

> **Ausführliche Dokumentation:** Setup-Optionen (lokal, Nginx, Apache2, Render.com, Fly.io), alle Env-Vars, Provider-Konfiguration und Sicherheitshinweise → **[docs/ai-service.md](docs/ai-service.md)**

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
- KI-Service Setup & Deployment: [`docs/ai-service.md`](docs/ai-service.md)
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

Die KI-Logik läuft als separater Fastify-Service mit zwei Endpunkten:

| Endpunkt | Funktion |
|---|---|
| `POST /describe` | Vision-Beschreibung für Bilder und PDFs (Alt-Text, Genre, Tags) |
| `POST /image-gen` | Bildgenerierung aus Textprompts (FLUX, DALL-E etc.) |
| `GET /health` | Health-Check |

PDFs werden serverseitig als Mehrseiten-Vorschau gerendert und mit Textauszug analysiert.

**Setup:**

```powershell
Copy-Item apps/image-describer/.env.example apps/image-describer/.env
```

In `apps/image-describer/.env` konfigurieren:

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `OPENROUTER_API_KEY` | Ja (Vision) | API-Key für Bildbeschreibung |
| `IMAGE_GEN_API_KEY` | Ja (Image Gen) | API-Key für Bildgenerierung |
| `IMAGE_GEN_API_URL` | Nein | Provider-URL (Default: Ollama lokal) |
| `IMAGE_GEN_MODEL` | Nein | Modellname (Default: `FLUX.1-schnell`) |

> Alle Variablen und Provider-Optionen (OpenRouter, ImageRouter, Ollama) → **[docs/ai-service.md](docs/ai-service.md)**

Service starten:

```bash
docker compose up -d image-describer
```

Demo auf Service zeigen (`apps/demo/.env`):

- `VITE_IMAGE_DESCRIBER_URL=http://localhost:8787`

Dann ruft die Demo `POST /describe` und `POST /image-gen` auf dem Container auf.

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
