/**
 * @blossom/tab-communikey — Community Tab Plugin for Blossom Media Widget
 *
 * Provides:
 * - Community media feed tab (browse media shared with your communities)
 * - Share-to-community action in the gallery sidebar
 *
 * @example
 * ```ts
 * import { communityTabPlugin } from '@blossom/tab-communikey';
 *
 * BlossomMedia.init({
 *   servers: ['https://blossom.primal.net'],
 *   plugins: [communityTabPlugin],
 * });
 * ```
 */

import type {
  TabPlugin,
  WidgetContext,
  UploadHistoryItem,
  Nip94FileEvent,
} from '@blossom/plugin/plugin';
import { iconGroups } from '@blossom/plugin/plugin';
import CommunityTab from './CommunityTab.svelte';
import { fetchMemberships } from './nostr/memberships';
import { fetchCommunity } from './nostr/community';
import { publishCommunityShare } from './nostr/share';
import type { CommunityInfo, CommunityMembership } from './nostr/types';

// ── Shared cache (lives in the plugin closure) ──────────────────────────────
let _memberships: CommunityMembership[] = [];
let _communities: Map<string, CommunityInfo> = new Map();
let _lastPubkey: string | null = null;

/**
 * Load memberships and community info for the current signer.
 * Results are cached; returns cached data if pubkey hasn't changed.
 */
async function ensureMemberships(ctx: WidgetContext): Promise<{
  memberships: CommunityMembership[];
  communities: Map<string, CommunityInfo>;
}> {
  const signer = ctx.signer;
  if (!signer) throw new Error('Kein Signer verfügbar.');

  const pubkey = await signer.getPublicKey();

  // Use cache if same pubkey
  if (pubkey === _lastPubkey && _memberships.length > 0) {
    return { memberships: _memberships, communities: _communities };
  }

  _lastPubkey = pubkey;
  _memberships = await fetchMemberships(pubkey, ctx.relayUrls);

  if (_memberships.length === 0) {
    throw new Error('Keine Communities gefunden. Tritt zuerst einer Community bei.');
  }

  // Resolve community profiles
  const newCommunities = new Map(_communities);
  await Promise.all(
    _memberships.map(async (m) => {
      if (newCommunities.has(m.communityPubkey)) return;
      const relays = m.relayHint
        ? [...ctx.relayUrls, m.relayHint]
        : ctx.relayUrls;
      const info = await fetchCommunity(m.communityPubkey, relays);
      if (info) newCommunities.set(m.communityPubkey, info);
    }),
  );
  _communities = newCommunities;

  return { memberships: _memberships, communities: _communities };
}

/**
 * Share handler — renders a community picker overlay inside a dialog.
 *
 * Because share handlers run from the gallery sidebar (outside the plugin
 * tab), we create a lightweight DOM overlay for the community picker.
 */
async function handleShare(
  item: UploadHistoryItem,
  nip94Event: Nip94FileEvent,
  ctx: WidgetContext,
): Promise<void> {
  const signer = ctx.signer;
  if (!signer) {
    ctx.reportError(new Error('Bitte zuerst anmelden.'));
    return;
  }

  // Load memberships (cached)
  let data: { memberships: CommunityMembership[]; communities: Map<string, CommunityInfo> };
  try {
    data = await ensureMemberships(ctx);
  } catch (err) {
    ctx.reportError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  // Build and show the picker overlay
  return new Promise<void>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'bm-share-overlay';
    overlay.innerHTML = `
      <div class="bm-share-dialog">
        <div class="bm-share-header">
          <span class="bm-share-title">👥 An Community teilen</span>
          <button type="button" class="bm-share-close">&times;</button>
        </div>
        <div class="bm-share-item-preview">
          ${nip94Event.thumbUrl || nip94Event.imageUrl
            ? `<img src="${nip94Event.thumbUrl || nip94Event.imageUrl}" alt="" class="bm-share-thumb" />`
            : ''}
          <span class="bm-share-item-name">${nip94Event.content || nip94Event.url}</span>
        </div>
        <div class="bm-share-body">
          <label class="bm-share-label">Community auswählen:</label>
          <select class="bm-share-select">
            ${data.memberships.map(m => {
              const info = data.communities.get(m.communityPubkey);
              const name = info?.name ?? `${m.communityPubkey.slice(0, 8)}…`;
              return `<option value="${m.communityPubkey}">${name}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="bm-share-actions">
          <button type="button" class="bm-share-cancel">Abbrechen</button>
          <button type="button" class="bm-share-confirm">Teilen</button>
        </div>
        <div class="bm-share-status" style="display:none"></div>
      </div>
    `;

    // Inject inline styles for the overlay (runs inside Shadow DOM)
    const style = document.createElement('style');
    style.textContent = `
      .bm-share-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 200;
      }
      .bm-share-dialog {
        background: var(--bm-bg, #fff);
        border-radius: 12px;
        padding: 1.2rem;
        min-width: 300px;
        max-width: 400px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
      }
      .bm-share-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .bm-share-title {
        font-weight: 700;
        font-size: 0.95rem;
        color: var(--bm-text, #222);
      }
      .bm-share-close {
        background: none;
        border: none;
        font-size: 1.3rem;
        cursor: pointer;
        color: var(--bm-text-muted, #888);
        padding: 0 4px;
      }
      .bm-share-item-preview {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: var(--bm-bg-subtle, #f8f8f8);
        border-radius: 6px;
        overflow: hidden;
      }
      .bm-share-thumb {
        width: 40px;
        height: 40px;
        border-radius: 4px;
        object-fit: cover;
        flex-shrink: 0;
      }
      .bm-share-item-name {
        font-size: 0.78rem;
        color: var(--bm-text, #222);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bm-share-body { display: flex; flex-direction: column; gap: 0.4rem; }
      .bm-share-label {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--bm-text-muted, #666);
      }
      .bm-share-select {
        font: inherit;
        font-size: 0.85rem;
        padding: 0.4rem 0.6rem;
        border: 1px solid var(--bm-input-border, #ccc);
        border-radius: 6px;
        background: var(--bm-input-bg, #fff);
        color: var(--bm-text, #222);
      }
      .bm-share-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
      }
      .bm-share-cancel, .bm-share-confirm {
        font: inherit;
        font-size: 0.82rem;
        padding: 0.45rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        border: none;
      }
      .bm-share-cancel {
        background: var(--bm-bg-subtle, #eee);
        color: var(--bm-text, #222);
      }
      .bm-share-confirm {
        background: var(--bm-accent, #6c63ff);
        color: #fff;
        font-weight: 600;
      }
      .bm-share-confirm:hover { background: var(--bm-accent-hover, #5a52d5); }
      .bm-share-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
      .bm-share-status {
        font-size: 0.78rem;
        text-align: center;
        padding: 0.3rem;
      }
    `;

    overlay.prepend(style);

    // Append overlay inside the widget's root element (the <dialog>)
    // so it stays within the Shadow DOM and inherits CSS custom properties.
    const widgetRoot = ctx.rootElement ?? document.body;
    widgetRoot.appendChild(overlay);

    const selectEl = overlay.querySelector('.bm-share-select') as HTMLSelectElement;
    const confirmBtn = overlay.querySelector('.bm-share-confirm') as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('.bm-share-cancel') as HTMLButtonElement;
    const closeBtn = overlay.querySelector('.bm-share-close') as HTMLButtonElement;
    const statusEl = overlay.querySelector('.bm-share-status') as HTMLElement;

    function cleanup() {
      overlay.remove();
      resolve();
    }

    cancelBtn.onclick = cleanup;
    closeBtn.onclick = cleanup;
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };

    confirmBtn.onclick = async () => {
      const communityPubkey = selectEl.value;
      if (!communityPubkey) return;

      const info = data.communities.get(communityPubkey);
      const communityRelay = info?.relays?.[0];
      if (!communityRelay) {
        statusEl.style.display = 'block';
        statusEl.style.color = 'var(--bm-danger, #d63031)';
        statusEl.textContent = 'Kein Relay für diese Community gefunden.';
        return;
      }

      confirmBtn.disabled = true;
      statusEl.style.display = 'block';
      statusEl.style.color = 'var(--bm-text-muted, #888)';
      statusEl.textContent = 'Wird geteilt…';

      try {
        await publishCommunityShare(
          signer,
          nip94Event.eventId,
          communityPubkey,
          communityRelay,
          ctx.relayUrls,
        );

        statusEl.style.color = 'var(--bm-accent, #6c63ff)';
        statusEl.textContent = '✓ Erfolgreich geteilt!';

        // Auto-close after short delay
        setTimeout(cleanup, 1200);
      } catch (err) {
        statusEl.style.color = 'var(--bm-danger, #d63031)';
        statusEl.textContent = `Fehler: ${err instanceof Error ? err.message : String(err)}`;
        confirmBtn.disabled = false;
      }
    };
  });
}

// ── Plugin definition ────────────────────────────────────────────────────────

/**
 * Communikey community tab plugin.
 *
 * Adds a "Community Media" tab to the Blossom Media Widget and a
 * "An Community teilen" share action to the gallery sidebar.
 */
export const communityTabPlugin: TabPlugin = {
  id: 'communikey',
  label: 'Community Media',
  icon: iconGroups(),
  order: 50,

  // Svelte 5 component for the tab content
  component: CommunityTab as any,

  // Share target: appears in gallery sidebar share popover
  shareTargets: [
    {
      id: 'communikey-share',
      label: 'An Community teilen',
      icon: iconGroups(),
      handler: handleShare,
    },
  ],

  // Lifecycle hooks
  onActivate(ctx) {
    // Pre-fetch memberships when tab is activated
    if (ctx.signer) {
      ensureMemberships(ctx).catch(() => {
        // Silently fail — the CommunityTab will show an error state
      });
    }
  },

  onDestroy() {
    // Clear cache
    _memberships = [];
    _communities = new Map();
    _lastPubkey = null;
  },
};

// Re-export nostr helpers for advanced usage
export * from './nostr';
