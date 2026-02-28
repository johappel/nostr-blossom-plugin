/**
 * @blossom/tab-oer-shares — OER-Shares Tab Plugin for Blossom Media Widget
 *
 * Provides:
 * - "Im Edufeed teilen" share action in the gallery sidebar
 * - AMB metadata form with SKOS vocabulary selectors
 * - OER-Shares tab to browse own kind:30142 events
 *
 * @example
 * ```ts
 * import { oerSharesPlugin } from '@blossom/tab-oer-shares';
 *
 * BlossomMedia.init({
 *   servers: ['https://blossom.primal.net'],
 *   plugins: [oerSharesPlugin],
 * });
 * ```
 */

import type {
  TabPlugin,
  WidgetContext,
  UploadHistoryItem,
  Nip94FileEvent,
} from '@blossom/plugin/plugin';
import { mount, unmount } from 'svelte';
import OerSharesTab from './OerSharesTab.svelte';
import OerShareForm from './OerShareForm.svelte';
import { clearSkosCache } from './nostr/skos';
import { loadConfig } from './config';

// ── Share handler ────────────────────────────────────────────────────────────

/**
 * Opens the AMB share form as an overlay inside the widget's root element
 * (Shadow DOM). The form is a full Svelte component mounted on-the-fly.
 */
async function handleShare(
  _item: UploadHistoryItem,
  nip94Event: Nip94FileEvent,
  ctx: WidgetContext,
): Promise<void> {
  const signer = ctx.signer;
  if (!signer) {
    ctx.reportError(new Error('Bitte zuerst anmelden.'));
    return;
  }

  const config = loadConfig();

  return new Promise<void>((resolve) => {
    const container = document.createElement('div');
    const widgetRoot = ctx.rootElement ?? document.body;
    widgetRoot.appendChild(container);

    let formInstance: Record<string, unknown> | null = null;

    function cleanup() {
      if (formInstance) {
        try { unmount(formInstance); } catch { /* ignore */ }
        formInstance = null;
      }
      container.remove();
      resolve();
    }

    formInstance = mount(OerShareForm, {
      target: container,
      props: {
        nip94: nip94Event,
        ctx,
        onclose: cleanup,
        relayUrl: config.ambRelayUrl,
        vocabUrls: config.vocabUrls,
      },
    });
  });
}

// ── Plugin definition ────────────────────────────────────────────────────────

/**
 * OER-Shares tab plugin.
 *
 * Adds an "OER-Shares" tab to the Blossom Media Widget and an
 * "Im Edufeed teilen" share action to the gallery sidebar.
 *
 * Resources are published as kind:30142 AMB events to the Edufeed relay.
 */
export const oerSharesPlugin: TabPlugin = {
  id: 'oer-shares',
  label: 'OER-Shares',
  icon: '🎓',
  order: 110,

  // Svelte 5 component for the tab content
  component: OerSharesTab as any,

  // Share target: appears in gallery sidebar share popover
  shareTargets: [
    {
      id: 'oer-edufeed-share',
      label: 'Im Edufeed teilen',
      icon: '🎓',
      handler: handleShare,
    },
  ],

  // Lifecycle hooks
  onActivate(_ctx) {
    // Pre-load config so vocabulary URLs are ready
    loadConfig();
  },

  onDestroy() {
    // Clear vocabulary cache
    clearSkosCache();
  },
};

// Re-export nostr helpers for advanced usage
export * from './nostr';
export { loadConfig, saveConfig } from './config';
export type { OerSharesConfig } from './config';
