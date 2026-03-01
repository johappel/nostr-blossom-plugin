# Blossom Media Widget — Integration Guide

Das Widget ist ein einbettbares Mediathek-Script (ähnlich dem WordPress Media Picker).
Es scannt die Seite nach markierten Feldern, injiziert einen **🌸 Mediathek**-Button und öffnet bei Klick einen Dialog mit Upload- und Galerie-Tab.

Für lokale Beispiele siehe:

- `examples/simple-input.html` (Standard-Integration)
- `examples/bookmarklet.html` (Standalone-Bookmarklet)
- `examples/bookmarklet-popup.html` (Popup-Zielseite)

---

## Installation

### Schritt 1 — Bundle bauen

```bash
pnpm --filter @blossom/plugin build:widget
# → packages/blossom-plugin/dist/widget/blossom-media.iife.js
# → packages/blossom-plugin/dist/widget/blossom-media.esm.js
```

### Schritt 2 — In HTML einbinden

**Variante A — Auto-Init via `data-blossom-config`** (kein eigenes Script nötig):

```html
<input type="text" data-blossom name="imageUrl" />

<script
  src="/assets/blossom-media.iife.js"
  data-blossom-config='{
    "servers": ["https://blossom.primal.net"],
    "relayUrl": "wss://relay.damus.io"
  }'
></script>
```

**Variante B — Manuelles Init** (für Callbacks und dynamische Konfiguration):

```html
<script src="/assets/blossom-media.iife.js"></script>
<script>
  const media = window.BlossomMedia.init({
    servers: ['https://blossom.primal.net'],
    relayUrl: 'wss://relay.damus.io',
    onInsert: (result, targetEl) => {
      console.log(result.url);
    },
  });
</script>
```

### GitHub Pages (optional)

Im Repository ist ein Workflow für GitHub Pages vorhanden:

- `.github/workflows/deploy-pages.yml`

Die Pages-Startseite leitet auf `examples/simple-input.html` weiter.

**Variante C — ESM-Import** (für Build-Systeme wie Vite, Webpack):

```js
import { init } from '@blossom/plugin/widget';

const media = init({
  servers: ['https://blossom.primal.net'],
  relayUrl: 'wss://relay.damus.io',
});
```

---

## Felder markieren

Jedes `<input>` oder `<textarea>` mit dem Attribut `data-blossom` erhält automatisch einen **🌸 Mediathek**-Button. Nach dem Auswählen einer Datei wird die URL direkt ins Feld geschrieben.

```html
<input type="text" data-blossom />
<textarea data-blossom></textarea>
```

Alternativ kann ein beliebiger CSS-Selektor über `targets` konfiguriert werden:

```js
window.BlossomMedia.init({
  servers: ['https://blossom.primal.net'],
  targets: '.upload-field, [data-media], textarea.content',
});
```

---

## `BlossomMediaConfig` — Konfigurationsoptionen

| Option | Typ | Pflicht | Standard | Beschreibung |
|---|---|:---:|---|---|
| `servers` | `string[]` | ✅ | — | Liste der Blossom-Server-URLs für Upload und Galerie-Listing. Mehrere Server werden parallel angefragt; der erste erfolgreiche wird verwendet. |
| `targets` | `string` | — | `'[data-blossom]'` | CSS-Selektor für Felder, die einen Trigger-Button erhalten sollen. Auch dynamisch hinzugefügte Elemente werden per `MutationObserver` erfasst. |
| `signer` | `BlossomSigner` | — | `window.nostr` | Nostr-Signer für Upload-Authentifizierung und Event-Publishing. Muss `getPublicKey()` und `signEvent()` implementieren. Fällt auf NIP-07 (`window.nostr`) zurück, wenn nicht angegeben. |
| `relayUrl` | `string` | — | — | WebSocket-URL des Nostr-Relays. Wird für NIP-94 Kind-1063 Publikation und Galerie-Fetch benötigt. Ohne diese Option werden keine Events publiziert/geladen. |
| `visionEndpoint` | `string` | — | — | Basis-URL des KI-Vision-Dienstes (`apps/image-describer`). Aktiviert den **KI-Vorschlag**-Button im Metadaten-Formular. Akzeptiert Bare-Host-URLs — `/describe` wird automatisch angehängt. |
| `insertMode` | `InsertMode` | — | `'url'` | Steuert, wie die URL nach der Auswahl ins Zielfeld geschrieben wird. Mögliche Werte: `'url'`, `'markdown'`, `'markdown-desc'`, `'html'`, `'nostr-tag'`, `'json'`. |
| `features` | `BlossomMediaFeatures` | — | alle `true` | Feature-Flags zum Ein-/Ausblenden einzelner Widget-Bereiche. Siehe Tabelle unten. |
| `tabs` | `CustomTab[]` | — | `[]` | Zusätzliche Custom-Tabs (Legacy). **Deprecated** — besser `plugins` nutzen. |
| `plugins` | `TabPlugin[]` | — | `[]` | Modernes Tab-Plugin-System (Svelte/Vanilla), empfohlen für Erweiterungen. |
| `onInsert` | `(result, targetEl) => void` | — | — | Callback nach „Übernehmen". Erhält das vollständige `InsertResult`-Objekt und das Ziel-DOM-Element. |
| `onUpload` | `(tags, url) => void` | — | — | Callback direkt nach erfolgreichem Upload — vor dem Metadaten-Dialog. |
| `onDelete` | `(url) => void` | — | — | Callback nach dem Löschen einer Datei. |
| `onError` | `(error) => void` | — | — | Callback bei nicht behebbaren Fehlern (Upload-Fehler, Netzwerkfehler). |

### `InsertMode`

| Wert | Ergebnis im Zielfeld |
|---|---|
| `'url'` | `https://cdn.example.com/image.webp` |
| `'markdown'` | `![Alt-Text](https://cdn.example.com/image.webp)` |
| `'markdown-desc'` | `Beschreibung` + Zeilenumbruch + `![Alt-Text](url)` |
| `'html'` | `<img src="https://cdn.example.com/image.webp" alt="Alt-Text">` |
| `'nostr-tag'` | NIP-94 `imeta`-Tag-String |
| `'json'` | JSON mit URL + Metadaten |

### `BlossomMediaFeatures`

| Flag | Standard | Beschreibung |
|---|:---:|---|
| `upload` | `true` | Zeigt den Tab „Dateien hochladen" |
| `gallery` | `true` | Zeigt den Tab „Mediathek" |
| `imageGen` | `true` | Zeigt den Tab „Bild erstellen" (wenn Image-Gen-Endpoint verfügbar ist) |
| `aiDescription` | `true` | Zeigt den KI-Vorschlag-Button im Metadaten-Formular (benötigt `visionEndpoint`) |
| `metadata` | `true` | Zeigt das vollständige Metadaten-Formular (Beschreibung, Alt, Autor, Lizenz …) |
| `deleteFiles` | `true` | Erlaubt das Löschen von Dateien aus der Galerie |
| `community` | `true` | Zeigt den eingebauten Community-Tab (falls Plugin im Bundle aktiv) |

---

## `BlossomMediaInstance` — Instanz-API

Wird von `init()` zurückgegeben.

### `open(targetElement?)`

Öffnet den Widget-Dialog programmatisch.

```js
const media = window.BlossomMedia.init({ servers: ['…'] });

document.querySelector('#my-btn').addEventListener('click', () => {
  media.open(document.querySelector('#image-input'));
});
```

| Parameter | Typ | Beschreibung |
|---|---|---|
| `targetElement` | `HTMLElement` (optional) | Das Feld, in das nach der Auswahl die URL geschrieben werden soll. Überschreibt das zuletzt geklickte Feld. |

### `close()`

Schließt den Dialog programmatisch.

```js
media.close();
```

### `destroy()`

Entfernt das Widget vollständig aus dem DOM, trennt den `MutationObserver` und entfernt alle injizierten Buttons.

```js
media.destroy();
```

---

## `InsertResult` — Callback-Payload

Objekt, das an `onInsert` übergeben wird.

| Feld | Typ | Beschreibung |
|---|---|---|
| `url` | `string` | Primäre Datei-URL |
| `thumbnailUrl` | `string?` | Thumbnail-URL (200 px), falls erstellt |
| `previewUrl` | `string?` | Vorschau-URL (600 px), falls erstellt |
| `mimeType` | `string?` | MIME-Typ, z. B. `image/webp` |
| `sha256` | `string?` | SHA-256-Hash der Originaldatei |
| `size` | `number?` | Dateigröße in Bytes |
| `description` | `string?` | Lange Bildbeschreibung |
| `alt` | `string?` | Alt-Text / Attribution |
| `author` | `string?` | Autor / Urheber |
| `license` | `string?` | Kanonische Lizenz-URL |
| `licenseLabel` | `string?` | Kurzes Lizenz-Label, z. B. `CC-BY-4.0` |
| `genre` | `string?` | Genre / Stilangabe |
| `keywords` | `string[]?` | Keyword-Tags |
| `tags` | `string[][]` | Alle rohen NIP-94 Tags aus der Upload-Response |

---

## `BlossomSigner` — Interface

Das Widget ist auth-unabhängig. Jedes Objekt, das folgendes Interface erfüllt, kann als Signer verwendet werden:

```ts
interface BlossomSigner {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedEvent): Promise<SignedEvent>;
}
```

Kompatible Implementierungen:

| Implementierung | Beschreibung |
|---|---|
| `window.nostr` | NIP-07 Browser-Extension (Alby, nos2x …) — wird automatisch als Fallback verwendet |
| NDK `NDKNip07Signer` | NDK-Wrapper für NIP-07 |
| NDK `NDKNip46Signer` | NDK-Wrapper für NIP-46 Bunker |
| Eigene Implementierung | Jedes Objekt mit `getPublicKey()` + `signEvent()` |

---

## KI-Vision-Service (`image-describer`)

Der KI-Vorschlag-Button im Metadaten-Formular benötigt einen laufenden `image-describer`-Service.

### Starten

```bash
# .env anlegen
cp apps/image-describer/.env.example apps/image-describer/.env
# OPENROUTER_API_KEY setzen, dann:
docker compose up -d image-describer
```

### Konfigurieren

```js
window.BlossomMedia.init({
  servers: ['https://blossom.primal.net'],
  visionEndpoint: 'http://localhost:8787',  // /describe wird automatisch angehängt
});
```

Der Service erwartet `POST /describe` mit `{ imageUrl: string }` und antwortet mit:

```json
{
  "description": "Landschaft mit Bergen…",
  "alt": "Bergpanorama mit Schnee",
  "genre": "photorealistic",
  "tags": ["berge", "natur", "winter"]
}
```

---

## Sicherheitshinweise

- **Kein `nsec`-Support** — das Widget unterstützt keine direkte Schlüsseleingabe.
- Der Shadow DOM isoliert Widget-Styles vollständig von der Host-Seite.
- Upload-Auth-Events (BUD-02 Kind-24242) werden nur im Memory gehalten und nicht persistiert.
- Externe Requests (Blossom-Server, Relay, Vision-API) werden bei Fehlern explizit als Fehler gemeldet — kein stiller Fallback.
