/**
 * @blossom/tab-example — Example Tab Plugin
 *
 * Demonstrates both vanilla-DOM and Svelte tab plugin patterns.
 * Use this as a starting template for your own tab plugins.
 *
 * @example
 * ```ts
 * import { exampleTabPlugin } from '@blossom/tab-example';
 *
 * BlossomMedia.init({
 *   servers: ['https://blossom.example.com'],
 *   plugins: [exampleTabPlugin],
 * });
 * ```
 */

import type { TabPlugin, WidgetContext } from '@blossom/plugin/plugin';

/**
 * Example tab plugin using vanilla DOM rendering.
 *
 * Shows how to:
 * - Read reactive state from `ctx` (signer, servers, items)
 * - Subscribe to context events
 * - Call actions (insert, refreshGallery, close)
 * - Clean up on destroy
 */
export const exampleTabPlugin: TabPlugin = {
  id: 'example',
  label: 'Example',
  icon: '🧩',
  order: 200,

  render(container: HTMLElement, ctx: WidgetContext): () => void {
    // ── Root element ──────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.style.cssText = 'padding: 16px; font-family: system-ui, sans-serif; display: flex; flex-direction: column; gap: 12px;';

    // ── Info section ──────────────────────────────────────────────────────
    const info = document.createElement('div');
    info.style.cssText = 'padding: 12px; background: #f5f5f5; border-radius: 8px; font-size: 14px; line-height: 1.6;';
    root.appendChild(info);

    function updateInfo() {
      const signer = ctx.signer;
      const servers = ctx.servers;
      const items = ctx.items;
      info.innerHTML = `
        <strong>🧩 Example Tab Plugin</strong><br>
        <code>Signer:</code> ${signer ? '✅ verfügbar' : '❌ nicht verfügbar'}<br>
        <code>Server:</code> ${servers.length > 0 ? servers.join(', ') : '(keine)'}<br>
        <code>Relays:</code> ${ctx.relayUrls.length > 0 ? ctx.relayUrls.join(', ') : '(keine)'}<br>
        <code>Gallery Items:</code> ${items.length}<br>
        <code>Active Tab:</code> ${ctx.activeTab}<br>
      `;
    }
    updateInfo();

    // ── Event subscriptions ───────────────────────────────────────────────
    const unsubs: Array<() => void> = [];

    unsubs.push(ctx.on('signer-changed', () => updateInfo()));
    unsubs.push(ctx.on('settings-changed', () => updateInfo()));
    unsubs.push(ctx.on('gallery-loaded', () => updateInfo()));
    unsubs.push(ctx.on('tab-changed', () => updateInfo()));

    // ── Action buttons ────────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';
    root.appendChild(btnRow);

    function addButton(label: string, onClick: () => void) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = 'padding: 8px 16px; border: 1px solid #ccc; border-radius: 6px; background: white; cursor: pointer; font-size: 13px;';
      btn.addEventListener('click', onClick);
      btnRow.appendChild(btn);
      return btn;
    }

    addButton('🔄 Gallery neu laden', () => ctx.refreshGallery());
    addButton('✕ Widget schließen', () => ctx.close());
    addButton('📋 Test-Insert', () => {
      ctx.insert({
        url: 'https://example.com/test-image.jpg',
        mimeType: 'image/jpeg',
        description: 'Test image from example plugin',
        tags: [['url', 'https://example.com/test-image.jpg']],
        formattedText: 'https://example.com/test-image.jpg',
      });
    });

    // ── Mount ─────────────────────────────────────────────────────────────
    container.appendChild(root);

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      for (const unsub of unsubs) unsub();
      root.remove();
    };
  },

  onActivate(ctx) {
    console.log('[ExamplePlugin] Tab activated, signer:', ctx.signer ? 'yes' : 'no');
  },

  onDeactivate(ctx) {
    console.log('[ExamplePlugin] Tab deactivated');
  },

  onDestroy(ctx) {
    console.log('[ExamplePlugin] Widget destroyed');
  },
};

export default exampleTabPlugin;
