<script lang="ts">
  /**
   * ExampleTab.svelte — Svelte 5 component variant of the example tab plugin.
   *
   * Shows how to build a tab plugin as a Svelte component that receives
   * the `WidgetContext` as a prop.
   *
   * Usage:
   * ```ts
   * import ExampleTab from '@blossom/tab-example/ExampleTab.svelte';
   * const plugin: TabPlugin = {
   *   id: 'example-svelte',
   *   label: 'Example (Svelte)',
   *   icon: '⚡',
   *   component: ExampleTab,
   * };
   * ```
   */

  import type { WidgetContext } from '@blossom/plugin/plugin';

  let { ctx }: { ctx: WidgetContext } = $props();

  let log = $state<string[]>([]);

  function addLog(msg: string) {
    log = [...log.slice(-19), `${new Date().toLocaleTimeString()} — ${msg}`];
  }

  // Subscribe to context events
  $effect(() => {
    const unsubs = [
      ctx.on('signer-changed', (s) => addLog(`Signer changed: ${s ? 'available' : 'null'}`)),
      ctx.on('gallery-loaded', ({ items }) => addLog(`Gallery loaded: ${items.length} items`)),
      ctx.on('settings-changed', () => addLog('Settings changed')),
      ctx.on('tab-changed', (tab) => addLog(`Tab changed: ${tab}`)),
    ];
    return () => unsubs.forEach((u) => u());
  });
</script>

<div class="example-svelte-tab">
  <h3>⚡ Svelte Tab Plugin Example</h3>

  <div class="info-grid">
    <span class="label">Signer:</span>
    <span>{ctx.signer ? '✅ verfügbar' : '❌ nicht verfügbar'}</span>
    <span class="label">Server:</span>
    <span>{ctx.servers.length > 0 ? ctx.servers.join(', ') : '(keine)'}</span>
    <span class="label">Relays:</span>
    <span>{ctx.relayUrls.length > 0 ? ctx.relayUrls.join(', ') : '(keine)'}</span>
    <span class="label">Items:</span>
    <span>{ctx.items.length}</span>
  </div>

  <div class="actions">
    <button onclick={() => ctx.refreshGallery()}>🔄 Refresh</button>
    <button onclick={() => ctx.close()}>✕ Close</button>
    <button onclick={() => ctx.insert({
      url: 'https://example.com/svelte-test.jpg',
      mimeType: 'image/jpeg',
      tags: [['url', 'https://example.com/svelte-test.jpg']],
      formattedText: 'https://example.com/svelte-test.jpg',
    })}>📋 Test Insert</button>
  </div>

  <div class="event-log">
    <strong>Event Log:</strong>
    <div class="log-scroll">
      {#each log as entry}
        <div class="log-line">{entry}</div>
      {/each}
      {#if log.length === 0}
        <div class="log-empty">Warte auf Events…</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .example-svelte-tab {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: system-ui, sans-serif;
  }
  h3 {
    margin: 0;
    font-size: 16px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    font-size: 14px;
    padding: 12px;
    background: #f5f5f5;
    border-radius: 8px;
  }
  .label {
    font-weight: 600;
    color: #555;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .actions button {
    padding: 8px 16px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 13px;
  }
  .actions button:hover {
    background: #f5f5f5;
  }
  .event-log {
    padding: 12px;
    background: #1e1e1e;
    color: #d4d4d4;
    border-radius: 8px;
    font-size: 12px;
    font-family: 'Fira Code', monospace;
  }
  .log-scroll {
    max-height: 200px;
    overflow-y: auto;
    margin-top: 8px;
  }
  .log-line {
    padding: 2px 0;
    border-bottom: 1px solid #333;
  }
  .log-empty {
    color: #666;
    font-style: italic;
  }
</style>
