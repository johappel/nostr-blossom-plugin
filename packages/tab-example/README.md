# @blossom/tab-example

Referenz-Paket, das zeigt, wie eigene Tab-Plugins für das Blossom Media Widget entwickelt und deployed werden.

Enthält zwei Plugin-Varianten:
- **Vanilla DOM** (`exampleTabPlugin`) — Kein Framework nötig, funktioniert überall
- **Svelte 5** (`ExampleTab.svelte`) — Nutzung von Runes, `$props`, `$effect`

---

## Inhalte

```
src/
  index.ts             # Vanilla-DOM Plugin (export: exampleTabPlugin)
  ExampleTab.svelte    # Svelte 5 Component-Variante
```

---

## Schnellstart: Plugin lokal testen

### 1. IIFE-Bundle mit Plugin bauen

Das einfachste Setup: Plugin direkt in den Widget-Build integrieren.

**a) Alias in `packages/blossom-plugin/vite.config.widget.ts` ergänzen:**

```ts
resolve: {
  alias: {
    '@blossom/tab-example': path.resolve(__dirname, '../tab-example/src/index.ts'),
    // … bestehende Aliase
  },
},
```

**b) Import + Auto-Injektion in `packages/blossom-plugin/src/widget/index.svelte.ts`:**

```ts
import { exampleTabPlugin } from '@blossom/tab-example';

// In init():
config.plugins = [exampleTabPlugin, ...(config.plugins ?? [])];
```

**c) Bauen:**

```bash
pnpm --filter @blossom/plugin build:widget
```

**d) Fertig** — jede HTML-Seite, die das IIFE-Bundle lädt, zeigt den Tab automatisch:

```html
<script src="blossom-media.iife.js"></script>
<script>
  window.BlossomMedia.init({
    servers: ['https://blossom.primal.net'],
    relayUrl: 'wss://relay.damus.io',
    targets: '',
  }).open();
</script>
```

---

## Serverless-Deployment (ohne Vite/Node)

Das fertige IIFE-Bundle (`blossom-media.iife.js`) ist eine einzelne Datei.
Kein Server, kein Build-Tool, kein Node.js zur Laufzeit nötig.

### Variante A: Statisches Hosting (empfohlen)

1. **`blossom-media.iife.js`** auf beliebigen Webspace kopieren (Netlify, GitHub Pages, S3, Nginx, Apache, …)
2. **HTML-Seite** daneben legen:

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Blossom Media</title>
</head>
<body>
  <script src="blossom-media.iife.js"></script>
  <script>
    // Warte auf NIP-07 Signer (Extension braucht kurz)
    var tries = 0;
    (function poll() {
      if (window.nostr || tries++ > 20) return start();
      setTimeout(poll, 250);
    })();

    function start() {
      window.BlossomMedia.init({
        servers: ['https://blossom.primal.net'],
        relayUrl: 'wss://relay.damus.io',
        signer: window.nostr || undefined,
        targets: '',
      }).open();
    }
  </script>
</body>
</html>
```

3. **Hochladen** — Fertig. Funktioniert auf jeder Domain, auch `file://` (außer ESM-Imports).

### Variante B: Bookmarklet

Siehe `examples/bookmarklet-popup.html` — öffnet das Widget als Popup-Fenster,
kopiert die URL in die Zwischenablage. Ideal für CSP-geschützte Seiten.

### Variante C: Inline-Plugin ohne Build

Für schnelle Prototypen: Plugin direkt im `<script>`-Tag der HTML-Seite definieren,
ohne es in den Build zu integrieren:

```html
<script src="blossom-media.iife.js"></script>
<script>
  // Eigener Tab als Vanilla-DOM Plugin — kein Build nötig
  var meinPlugin = {
    id: 'mein-tab',
    label: 'Mein Tab',
    icon: '🔧',
    order: 200,

    render: function (container, ctx) {
      var div = document.createElement('div');
      div.style.padding = '16px';
      div.innerHTML = '<h3>Hallo Welt!</h3><p>Items: ' + ctx.items.length + '</p>';
      container.appendChild(div);

      // Auf Events reagieren
      var unsub = ctx.on('gallery-loaded', function (data) {
        div.querySelector('p').textContent = 'Items: ' + data.items.length;
      });

      // Cleanup-Funktion zurückgeben
      return function () {
        unsub();
        div.remove();
      };
    }
  };

  window.BlossomMedia.init({
    servers: ['https://blossom.primal.net'],
    relayUrl: 'wss://relay.damus.io',
    targets: '',
    plugins: [meinPlugin],
  }).open();
</script>
```

---

## Plugin-Architektur

### TabPlugin Interface

```ts
interface TabPlugin {
  id: string;                    // Eindeutige ID
  label: string;                 // Tab-Beschriftung
  icon?: string;                 // Emoji oder SVG
  order?: number;                // Sortierung (Builtins 0–99, Plugins ab 100)

  // Rendering — EINES von beiden:
  render?(container: HTMLElement, ctx: WidgetContext): () => void;  // Vanilla DOM
  component?: SvelteComponent;   // Svelte 5 Component (erhält { ctx } als prop)

  // Optional: Share-Actions in der Gallery-Sidebar
  shareTargets?: ShareTarget[];

  // Lifecycle
  onActivate?(ctx: WidgetContext): void;
  onDeactivate?(ctx: WidgetContext): void;
  onDestroy?(ctx: WidgetContext): void;
}
```

### WidgetContext (Getter-basiert, kein Proxy)

| Getter | Typ | Beschreibung |
|---|---|---|
| `signer` | `BlossomSigner \| null` | NIP-07/NIP-46 Signer |
| `servers` | `string[]` | Blossom-Server URLs |
| `relayUrls` | `string[]` | Nostr-Relay URLs |
| `items` | `UploadHistoryItem[]` | Gallery-Items |
| `nip94Data` | `Nip94FetchResult \| null` | NIP-94 Events |
| `userSettings` | `BlossomUserSettings` | User-Einstellungen |
| `activeTab` | `string` | Aktueller Tab |
| `targetElement` | `HTMLElement \| null` | Auslösendes Element |
| `rootElement` | `HTMLElement \| null` | Widget-Root (für Overlays) |
| `config` | `BlossomMediaConfig` | Gesamte Config |

| Action | Beschreibung |
|---|---|
| `insert(result)` | URL/Text einfügen + Widget schließen |
| `refreshGallery()` | Gallery neu laden |
| `close()` | Widget schließen |
| `switchTab(id)` | Tab wechseln |
| `reportError(err)` | Fehler anzeigen |

| Event | Payload |
|---|---|
| `signer-changed` | `BlossomSigner \| null` |
| `settings-changed` | `BlossomUserSettings` |
| `gallery-loaded` | `{ items, nip94Data }` |
| `tab-changed` | `string` |
| `open` / `close` | `void` |
| `share-completed` | `{ targetId, item }` |

### ShareTarget (für Gallery-Sidebar)

```ts
interface ShareTarget {
  id: string;
  label: string;
  icon?: string;
  handler(item: UploadHistoryItem, nip94: Nip94FileEvent, ctx: WidgetContext): Promise<void>;
}
```

Plugin-Beispiel mit Share-Target:

```ts
var plugin = {
  id: 'my-share',
  label: 'My Tab',
  icon: '📤',
  render: function (container, ctx) { /* … */ },
  shareTargets: [{
    id: 'my-share-action',
    label: 'An XYZ senden',
    icon: '🚀',
    handler: async function (item, nip94, ctx) {
      // item.url, nip94.eventId, ctx.signer nutzen
      await fetch('https://api.example.com/share', {
        method: 'POST',
        body: JSON.stringify({ url: item.url }),
      });
    }
  }]
};
```

---

## Eigenes Plugin als Paket (für Bundler)

Für SvelteKit / Vite-Projekte als npm-Paket:

```bash
mkdir packages/tab-mein-plugin
cd packages/tab-mein-plugin
```

**`package.json`:**
```json
{
  "name": "@blossom/tab-mein-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "peerDependencies": {
    "@blossom/plugin": "workspace:*"
  }
}
```

**`src/index.ts`:**
```ts
import type { TabPlugin, WidgetContext } from '@blossom/plugin/plugin';

export const meinPlugin: TabPlugin = {
  id: 'mein-plugin',
  label: 'Mein Plugin',
  icon: '🎯',
  order: 150,

  render(container, ctx) {
    const root = document.createElement('div');
    root.textContent = 'Hallo aus meinem Plugin!';
    container.appendChild(root);
    return () => root.remove();
  },
};
```

**Nutzung in SvelteKit:**
```ts
import { meinPlugin } from '@blossom/tab-mein-plugin';
import { init } from '@blossom/plugin/widget';

init({
  servers: ['https://blossom.primal.net'],
  plugins: [meinPlugin],
});
```

---

## Feature-Flags (für Builtin-Plugins)

Plugins, die fest in den IIFE-Build integriert sind, werden über Feature-Flags gesteuert:

```ts
BlossomMedia.init({
  servers: ['https://blossom.primal.net'],
  features: {
    upload: true,      // Standard-Tabs
    gallery: true,
    imageGen: true,
    community: true,   // Community-Tab (tab-communikey)
    // community: false  ← deaktiviert den Community-Tab
  },
});
```

Externe Plugins (via `plugins: [...]`) sind immer aktiv, wenn sie übergeben werden.

---

## Checkliste: Neues Plugin deployen

1. ☐ Plugin-Code schreiben (`render()` oder Svelte `component`)
2. ☐ Entscheiden: **Builtin** (IIFE) oder **extern** (ESM/inline)
3. ☐ **Falls Builtin:**
   - Alias in `vite.config.widget.ts` hinzufügen
   - Import + Feature-Flag in `index.svelte.ts`
   - Feature-Flag in `BlossomMediaFeatures` (types.ts)
   - `pnpm build:widget`
4. ☐ **Falls extern:**
   - Plugin als `plugins: [meinPlugin]` in `init()` übergeben
   - Entweder Bundler nutzen oder Inline-`<script>` (Vanilla DOM)
5. ☐ HTML-Datei auf statisches Hosting kopieren (Netlify, GitHub Pages, …)
6. ☐ Fertig — kein Server nötig
