# Tab Plugin Authoring Guide

This guide explains how to create external tab plugins for the Blossom Media Widget.

## Overview

The Tab Plugin API allows you to add new tabs to the media widget **without modifying the core code**. Each plugin is a self-contained module that receives a `WidgetContext` providing access to shared state (signer, servers, gallery items, etc.) and actions (insert, refresh, close).

## Quick Start

### 1. Create a new package

```
packages/
  my-tab-plugin/
    package.json
    tsconfig.json
    src/
      index.ts
```

**package.json**:
```json
{
  "name": "@blossom/tab-my-feature",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "peerDependencies": {
    "@blossom/plugin": "workspace:*"
  }
}
```

### 2. Define your plugin

```ts
import type { TabPlugin } from '@blossom/plugin/plugin';

export const myTabPlugin: TabPlugin = {
  id: 'my-feature',
  label: 'My Feature',
  icon: '🔧',   // optional
  order: 110,    // builtin tabs use 0-99, plugins default to 100

  render(container, ctx) {
    const div = document.createElement('div');
    div.textContent = `Server: ${ctx.servers.join(', ')}`;
    container.appendChild(div);

    // Return cleanup function (called on destroy)
    return () => div.remove();
  },
};
```

### 3. Register the plugin

```ts
import { myTabPlugin } from '@blossom/tab-my-feature';

BlossomMedia.init({
  servers: ['https://blossom.example.com'],
  plugins: [myTabPlugin],
});
```

## Plugin Interface

```ts
interface TabPlugin {
  /** Unique tab ID (must not collide with 'upload', 'gallery', 'imagegen') */
  id: string;
  /** Label displayed in the tab bar */
  label: string;
  /** Optional icon (emoji, SVG string, or URL) */
  icon?: string;
  /** Sort order (0-99 = builtin, 100+ = plugins, default: 100) */
  order?: number;

  // === Rendering (exactly ONE required) ===

  /** Vanilla DOM render function */
  render?: (container: HTMLElement, ctx: WidgetContext) => (() => void) | void;

  /** Svelte 5 component (receives { ctx: WidgetContext } as props) */
  component?: Component<{ ctx: WidgetContext }>;

  // === Lifecycle hooks (all optional) ===

  /** Called whenever this tab becomes active */
  onActivate?: (ctx: WidgetContext) => void;
  /** Called whenever this tab is deactivated */
  onDeactivate?: (ctx: WidgetContext) => void;
  /** Called when the widget is destroyed */
  onDestroy?: (ctx: WidgetContext) => void;

  // === Share targets (optional) ===

  /** Share actions shown in gallery sidebar popover */
  shareTargets?: ShareTarget[];
}
```

## WidgetContext API

The `WidgetContext` object is the plugin's window into the widget. All properties are **getters** that read the current reactive state — no Svelte proxies involved (NIP-07 safe).

### Reactive Getters

| Property | Type | Description |
|---|---|---|
| `signer` | `BlossomSigner \| null` | Current Nostr signer |
| `servers` | `string[]` | Effective Blossom server URLs |
| `relayUrls` | `string[]` | Effective relay WebSocket URLs |
| `items` | `UploadHistoryItem[]` | Gallery items (bloblist) |
| `nip94Data` | `Nip94FetchResult \| null` | NIP-94 events |
| `userSettings` | `BlossomUserSettings` | Current user settings |
| `activeTab` | `string` | Currently active tab ID |
| `targetElement` | `HTMLElement \| null` | Element that triggered the dialog |
| `config` | `BlossomMediaConfig` | Raw widget configuration |

### Actions

| Method | Description |
|---|---|
| `insert(result)` | Insert a result (fires `onInsert`, closes dialog) |
| `refreshGallery()` | Re-fetch bloblist + NIP-94 events |
| `close()` | Close the widget dialog |
| `switchTab(id)` | Switch to a different tab |
| `reportError(error)` | Report an error to `onError` callback |

### Events

Subscribe with `ctx.on(event, handler)` — returns an unsubscribe function.

| Event | Payload | When |
|---|---|---|
| `'signer-changed'` | `BlossomSigner \| null` | Signer availability changes |
| `'settings-changed'` | `BlossomUserSettings` | User settings updated |
| `'gallery-loaded'` | `{ items, nip94Data }` | Gallery load completes |
| `'tab-changed'` | `string` | Active tab changes |
| `'open'` | `void` | Widget dialog opens |
| `'close'` | `void` | Widget dialog closes |
| `'share-completed'` | `{ targetId, url }` | Share target handler completes |

## Svelte Component Plugin

Instead of vanilla DOM, you can provide a Svelte 5 component:

```svelte
<!-- MyTab.svelte -->
<script lang="ts">
  import type { WidgetContext } from '@blossom/plugin/plugin';

  let { ctx }: { ctx: WidgetContext } = $props();
</script>

<div>
  <p>Server count: {ctx.servers.length}</p>
  <button onclick={() => ctx.refreshGallery()}>Refresh</button>
</div>
```

```ts
import type { TabPlugin } from '@blossom/plugin/plugin';
import MyTab from './MyTab.svelte';

export const myPlugin: TabPlugin = {
  id: 'my-tab',
  label: 'My Tab',
  component: MyTab,
};
```

## Share Targets

Plugins can register **Share Targets** — actions that appear in the gallery sidebar's share popover (📤 button). This allows plugins to offer "Share to…" actions for any gallery item.

### ShareTarget Interface

```ts
interface ShareTarget {
  /** Unique share target ID */
  id: string;
  /** Label shown in the share popover */
  label: string;
  /** Icon (emoji or SVG string) */
  icon?: string;
  /** Handler called when the user selects this share target */
  handler: (
    item: UploadHistoryItem,
    nip94Event: Nip94FileEvent | undefined,
    ctx: WidgetContext,
  ) => void | Promise<void>;
}
```

### Registering Share Targets

Add `shareTargets` to your `TabPlugin` definition:

```ts
import type { TabPlugin, ShareTarget } from '@blossom/plugin/plugin';

const shareToMyService: ShareTarget = {
  id: 'my-share',
  label: 'Share to My Service',
  icon: '🔗',
  async handler(item, nip94Event, ctx) {
    // item.url — the Blossom blob URL
    // nip94Event — the NIP-94 metadata event (if available)
    // ctx — full WidgetContext for signer, servers, etc.
    await doSomethingWith(item.url);
  },
};

export const myPlugin: TabPlugin = {
  id: 'my-plugin',
  label: 'My Plugin',
  component: MyTab,
  shareTargets: [shareToMyService],
};
```

The share button (📤) appears in the gallery sidebar toolbar whenever at least one plugin provides share targets. Clicking it opens a popover listing all available targets.

### Events

When a share action completes, the widget emits `'share-completed'`:

| Event | Payload | When |
|---|---|---|
| `'share-completed'` | `{ targetId: string; url: string }` | A share target handler finishes |

## Example Plugins

- **`packages/tab-example/`**: Reference package with vanilla-DOM and Svelte component patterns.
- **`packages/tab-communikey/`**: Community media plugin (COMMUNIKEY protocol) — community feed browser + "Share to Community" action via `shareTargets`.

## Important Notes

- **Plugin IDs** must not collide with builtin IDs: `upload`, `gallery`, `imagegen`
- Context getters are **not deeply reactive** — they read the latest value when accessed. If you need reactivity in Svelte, use `$effect` or `$derived` over `ctx.*`.
- The `render()` container lives in the Shadow DOM, so host-page styles don't bleed in.
- Plugins should handle the case where `ctx.signer` is `null` (user not logged in).
- Always clean up subscriptions and DOM in the cleanup function / `onDestroy`.
