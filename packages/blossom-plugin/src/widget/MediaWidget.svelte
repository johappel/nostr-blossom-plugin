<script lang="ts">
  import type { BlossomMediaConfig, CustomTab, TabPlugin, ShareTarget, InsertResult, WidgetContext, WidgetEventMap } from './types';
  import type { BlossomSigner } from '../core/types';
  import type { UploadHistoryItem } from '../core/history';
  import type { Nip94FetchResult } from '../core/nip94';
  import type { VisionClientOptions } from '../core/vision';
  import type { BlossomUserSettings } from '../core/settings';
  import type { BunkerSession } from '../core/nip46';
  import type { PendingUpload } from '../core/pending-uploads';
  import { createEventEmitter } from './event-emitter';
  import { mount as svelteMount, unmount as svelteUnmount } from 'svelte';
  import { listBlossomBlobs } from '../core/list';
  import { fetchNip94Events } from '../core/nip94';
  import { updateHistoryItemByUrl, removeHistoryItemByUrl } from '../core/history';
  import { deleteBlossomBlob, publishDeletionEvent } from '../core/delete';
  import { buildImageMetadataTags } from '../core/metadata';
  import { publishEvent } from '../core/publish';
  import { publishMediaMetadata } from '../core/publish-media';
  import { resolveVisionEndpoint } from '../core/vision';
  import { resolveImageGenEndpoint } from '../core/imagegen';
  import {
    loadPendingUploads,
    removePendingUpload,
  } from '../core/pending-uploads';
  import {
    loadSettingsFromLocalStorage,
    mergeWithSettings,
    fetchSettingsEvent,
    mergeLocalAndRemote,
    saveSettingsToLocalStorage,
  } from '../core/settings';
  import { connectBunker } from '../core/nip46';
  import { untrack } from 'svelte';
  import UploadTab from './UploadTab.svelte';
  import GalleryTab from './GalleryTab.svelte';
  import ImageGenTab from './ImageGenTab.svelte';
  import MetadataSidebar from './MetadataSidebar.svelte';
  import SettingsPanel from './SettingsPanel.svelte';

  interface MediaWidgetProps {
    config: BlossomMediaConfig;
    /** Element that triggered the open (for insert-back if needed) */
    targetElement?: HTMLElement;
    /** Whether the dialog is currently open */
    open?: boolean;
    /** Tab to activate when opening (set by open(target, tab)) */
    requestedTab?: string;
    onClose?: () => void;
  }

  let {
    config,
    targetElement: _targetElement,
    open = $bindable(false),
    requestedTab = $bindable(undefined),
    onClose,
  }: MediaWidgetProps = $props();

  // ── Tabs ──────────────────────────────────────────────────────────────────
  type BuiltinTab = 'upload' | 'gallery' | 'imagegen';
  type TabId = BuiltinTab | string;

  interface TabDef {
    id: TabId;
    label: string;
    icon?: string;
    order: number;
    builtin?: BuiltinTab;
    custom?: CustomTab;
    plugin?: TabPlugin;
  }

  let tabs = $derived.by((): TabDef[] => {
    const result: TabDef[] = [];
    if (config.features?.upload !== false) {
      result.push({ id: 'upload', label: 'Dateien hochladen', order: 0, builtin: 'upload' });
    }
    if (config.features?.gallery !== false) {
      result.push({ id: 'gallery', label: 'Mediathek', order: 10, builtin: 'gallery' });
    }
    // Show image gen tab when feature is not explicitly disabled AND an endpoint is available
    if (config.features?.imageGen !== false && resolvedImageGenEndpoint) {
      result.push({ id: 'imagegen', label: 'Bild erstellen', order: 20, builtin: 'imagegen' });
    }
    // Legacy custom tabs (deprecated — use plugins instead)
    for (const ct of config.tabs ?? []) {
      result.push({ id: ct.id, label: ct.label, order: 100, custom: ct });
    }
    // Tab plugins (skip user-disabled ones)
    const disabled = new Set(userSettings.disabledPlugins ?? []);
    for (const p of config.plugins ?? []) {
      if (!disabled.has(p.id)) {
        result.push({ id: p.id, label: p.label, icon: p.icon, order: p.order ?? 100, plugin: p });
      }
    }
    result.sort((a, b) => a.order - b.order);
    return result;
  });

  // ── Collect share targets from active plugins ─────────────────────────────
  let shareTargets = $derived.by((): ShareTarget[] => {
    const disabled = new Set(userSettings.disabledPlugins ?? []);
    return (config.plugins ?? [])
      .filter(p => !disabled.has(p.id))
      .flatMap(p => p.shareTargets ?? []);
  });

  // Default to 'upload' — avoid eagerly reading `tabs` here because
  // resolvedImageGenEndpoint (referenced inside tabs) is declared later
  // and would cause a TDZ in the bundled output.
  let activeTab = $state<TabId>('upload');

  // ── Honour requestedTab from open(target, tab) ────────────────────────────
  $effect(() => {
    if (requestedTab && tabs.some((t) => t.id === requestedTab)) {
      activeTab = requestedTab as TabId;
      requestedTab = undefined; // consume — one-shot
    }
  });

  // ── Signer ────────────────────────────────────────────────────────────────
  // NIP-07 extensions inject `window.nostr` asynchronously, often after our
  // component has already mounted.  A plain `$derived` over `window.nostr`
  // won't re-evaluate because the global is not reactive.  We therefore use
  // a reactive state that is kept in sync via a short polling $effect.
  //
  // IMPORTANT: We MUST use `$state.raw` instead of `$state` here.  Svelte 5's
  // `$state()` wraps values in a deep reactive Proxy.  NIP-07 extension
  // objects (nos2x, Alby, …) rely on internal browser message channels that
  // break when proxied — `signEvent()` never resolves.  `$state.raw()` stores
  // the reference as-is without deep proxying.
  type WindowWithNostr = Window & { nostr?: BlossomSigner };

  function detectSigner(): BlossomSigner | null {
    if (config.signer) return config.signer;
    if (typeof window !== 'undefined' && (window as WindowWithNostr).nostr) {
      return (window as WindowWithNostr).nostr ?? null;
    }
    return null;
  }

  let signer = $state.raw<BlossomSigner | null>(detectSigner());

  // Poll for window.nostr up to ~5 s after mount (10 × 500 ms)
  $effect(() => {
    // Already have a signer from config — no need to poll
    if (config.signer) {
      signer = config.signer;
      return;
    }

    // Already detected
    if (signer) return;

    // Skip NIP-07 polling when bunker credentials are saved — the bunker
    // auto-reconnect $effect will handle signer assignment.
    if (userSettings.bunkerUri && userSettings.bunkerLocalKey) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    const iv = setInterval(() => {
      const detected = detectSigner();
      if (detected) {
        signer = detected;
        clearInterval(iv);
      } else if (++attempts >= MAX_ATTEMPTS) {
        clearInterval(iv);
      }
    }, 500);

    return () => clearInterval(iv);
  });

  // ── User settings & effective config ──────────────────────────────────────
  let userSettings = $state<BlossomUserSettings>(
    untrack(() => loadSettingsFromLocalStorage(config.appId ?? 'default')),
  );
  let settingsOpen = $state(false);

  let effective = $derived.by(() =>
    mergeWithSettings(
      config.servers,
      config.relayUrl,
      config.visionEndpoint,
      userSettings,
      config.imageGenEndpoint,
    ),
  );

  // Sync settings from relay when signer becomes available (once)
  let settingsSynced = $state(false);
  $effect(() => {
    if (!signer || settingsSynced) return;
    settingsSynced = true;
    const urls = effective.relayUrls;
    if (urls.length === 0) return;
    signer.getPublicKey().then((pubkey) => {
      fetchSettingsEvent(pubkey, urls).then((result) => {
        if (!result) return;
        const merged = mergeLocalAndRemote(userSettings, result.settings, result.createdAt);
        userSettings = merged;
        saveSettingsToLocalStorage(merged, config.appId ?? 'default');
      }).catch(() => { /* non-fatal */ });
    }).catch(() => { /* non-fatal */ });
  });

  function handleSettingsChanged(updated: BlossomUserSettings) {
    userSettings = updated;
  }

  // ── NIP-46 Bunker session management ──────────────────────────────────────
  let bunkerSession = $state.raw<BunkerSession | null>(null);

  // ── Notify host when signer becomes available ─────────────────────────────
  // Fires config.onSignerReady(pubkey) once when signer transitions from
  // null to non-null. Resets if signer becomes null again (disconnect).
  let signerReadyFired = $state(false);
  $effect(() => {
    if (signer && !signerReadyFired) {
      signerReadyFired = true;
      if (config.onSignerReady) {
        signer.getPublicKey()
          .then((pk) => config.onSignerReady?.(pk))
          .catch(() => { /* non-fatal */ });
      }
    } else if (!signer) {
      signerReadyFired = false;
    }
  });

  function handleBunkerConnected(session: BunkerSession) {
    bunkerSession = session;
    signer = session.signer;

    // Persist local key so we can auto-reconnect next time
    const updated: BlossomUserSettings = {
      ...userSettings,
      bunkerLocalKey: session.localPrivateKeyHex,
      updatedAt: Date.now(),
    };
    userSettings = updated;
    saveSettingsToLocalStorage(updated, config.appId ?? 'default');
  }

  function handleBunkerDisconnect() {
    bunkerSession?.disconnect();
    bunkerSession = null;

    // Clear bunker signer – fall back to NIP-07 or config.signer
    signer = detectSigner();

    // Remove persisted bunker key (but keep the URI for convenience)
    const updated: BlossomUserSettings = {
      ...userSettings,
      bunkerLocalKey: undefined,
      updatedAt: Date.now(),
    };
    userSettings = updated;
    saveSettingsToLocalStorage(updated, config.appId ?? 'default');
  }

  // Auto-reconnect from persisted bunker credentials on mount
  let bunkerAutoReconnected = $state(false);
  $effect(() => {
    if (bunkerAutoReconnected) return;
    if (bunkerSession) return;            // already connected
    if (config.signer) return;            // host-provided signer takes priority

    const uri = userSettings.bunkerUri;
    const key = userSettings.bunkerLocalKey;
    if (!uri || !key) return;

    bunkerAutoReconnected = true;

    // Reconnect in background — don't block mount
    connectBunker(uri, undefined, key)
      .then((session) => {
        // Only apply if nothing else has set a signer in the meantime
        if (!signer || signer === detectSigner()) {
          bunkerSession = session;
          signer = session.signer;

          // Explicitly reload gallery now that signer is available.
          // The $effect-based reload is a backup but this ensures immediate load.
          if (open) loadGalleryIfNeeded();
        }
      })
      .catch(() => {
        // Auto-reconnect failed silently – user can reconnect manually
      });
  });

  // ── Gallery state ─────────────────────────────────────────────────────────
  let items = $state<UploadHistoryItem[]>([]);
  let nip94Data = $state<Nip94FetchResult | null>(null);
  let galleryLoading = $state(false);
  let galleryError = $state('');
  /** Tracks whether the last successful gallery load included a signer. */
  let galleryLoadedWithSigner = $state(false);

  // When signer becomes available (e.g. bunker auto-reconnect) and the dialog
  // is open but gallery was previously loaded without a signer, reload.
  $effect(() => {
    if (signer && open && !galleryLoadedWithSigner && !galleryLoading) {
      loadGalleryIfNeeded();
    }
  });

  // ── Vision config ─────────────────────────────────────────────────────────
  let visionOptions = $derived.by<VisionClientOptions | undefined>(() => {
    const ep = effective.visionEndpoint ? resolveVisionEndpoint(effective.visionEndpoint) : null;
    return ep ? { endpoint: ep } : undefined;
  });

  // ── Image generation endpoint ────────────────────────────────────────────
  let resolvedImageGenEndpoint = $derived.by<string | undefined>(() => {
    // Explicit imageGenEndpoint takes priority
    const explicit = effective.imageGenEndpoint;
    if (explicit) {
      try { return resolveImageGenEndpoint(explicit); } catch { return undefined; }
    }
    // Fall back: derive from visionEndpoint (same server, /image-gen route)
    const vision = effective.visionEndpoint;
    if (vision) {
      try { return resolveImageGenEndpoint(vision); } catch { return undefined; }
    }
    return undefined;
  });

  // ── Edit-metadata overlay ─────────────────────────────────────────────────
  let editItem = $state<UploadHistoryItem | null>(null);

  // ── Dialog element ref ────────────────────────────────────────────────────
  let dialogEl = $state<HTMLDialogElement | null>(null);

  // Sync open state with <dialog>
  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
      loadGalleryIfNeeded();
      loadPendingIfNeeded();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  function handleDialogClose() {
    open = false;
    onClose?.();
  }

  function handleDialogClick(e: MouseEvent) {
    // Close when clicking the backdrop (the <dialog> itself)
    if (e.target === dialogEl) {
      open = false;
      onClose?.();
    }
  }

  // ── Gallery load ──────────────────────────────────────────────────────────
  async function loadGalleryIfNeeded() {
    if (effective.relayUrls.length === 0 && effective.servers.length === 0) return;
    if (galleryLoading) return;

    galleryLoading = true;
    galleryError = '';

    try {
      const resolvedSigner = signer;

      // Load bloblist from servers
      if (effective.servers.length > 0 && resolvedSigner) {
        const blobResult = await listBlossomBlobs(resolvedSigner, effective.servers);
        const now = new Date().toISOString();
        const blobItems: UploadHistoryItem[] = blobResult.blobs.map((b) => ({
          url: b.url,
          sha256: b.sha256,
          mime: b.type,
          createdAt: b.created ? new Date(b.created * 1000).toISOString() : now,
          uploadTags: [
            ['url', b.url],
            ...(b.sha256 ? [['x', b.sha256]] : []),
            ...(b.type ? [['m', b.type]] : []),
            ...(b.size ? [['size', String(b.size)]] : []),
          ],
        }));

        // Merge: existing items win on url match, others appended
        const merged = [...blobItems];
        for (const existing of items) {
          if (!merged.some((m) => m.url === existing.url)) {
            merged.push(existing);
          }
        }
        items = merged;
      }

      // Load NIP-94 events from relays
      if (effective.relayUrls.length > 0 && resolvedSigner) {
        nip94Data = await fetchNip94Events(resolvedSigner, effective.relayUrls);
      }
    } catch (err) {
      galleryError = err instanceof Error ? err.message : 'Mediathek konnte nicht geladen werden';
    } finally {
      galleryLoading = false;
      if (signer) galleryLoadedWithSigner = true;
    }
  }

  // ── Handle insert ─────────────────────────────────────────────────────────
  function handleInserted(result: InsertResult) {
    config.onInsert?.(result, _targetElement ?? null);
    config.onUpload?.(result.tags, result.url);
    open = false;
    onClose?.();
  }

  // ── Handle delete ─────────────────────────────────────────────────────────
  // Deletes ALL blossom blobs linked in the NIP-94 event (original, thumb, image),
  // then publishes a NIP-09 deletion event for the NIP-94 event itself.
  async function handleDelete(item: UploadHistoryItem) {
    const resolvedSigner = signer;
    if (!resolvedSigner) return;

    try {
      // Find the NIP-94 event so we know all linked blossom URLs
      const nip94Event = nip94Data?.events.find(
        (ev) =>
          ev.url === item.url ||
          (item.sha256 && ev.sha256 && item.sha256.toLowerCase() === ev.sha256.toLowerCase()),
      );

      // Collect all SHA-256 hashes to delete from blossom servers
      const hashesToDelete = new Set<string>();

      if (item.sha256) hashesToDelete.add(item.sha256.toLowerCase());
      if (nip94Event?.sha256) hashesToDelete.add(nip94Event.sha256.toLowerCase());

      // Extract SHA-256 from derivative URLs (thumb, image)
      if (nip94Event) {
        for (const derivUrl of [nip94Event.thumbUrl, nip94Event.imageUrl]) {
          if (!derivUrl) continue;
          // Look up in bloblist first
          const blobItem = items.find((i) => i.url === derivUrl);
          if (blobItem?.sha256) {
            hashesToDelete.add(blobItem.sha256.toLowerCase());
          } else {
            // Extract SHA-256 from blossom URL (pattern: /server/<sha256> or /server/<sha256>.ext)
            const extracted = extractSha256FromUrl(derivUrl);
            if (extracted) hashesToDelete.add(extracted);
          }
        }
      }

      // 1) Delete all blobs from blossom servers
      if (effective.servers.length > 0) {
        for (const hash of hashesToDelete) {
          try {
            await deleteBlossomBlob(resolvedSigner, effective.servers, hash);
          } catch {
            // Partial failure is acceptable – continue with remaining hashes
          }
        }
      }

      // 2) Delete NIP-94 event via NIP-09
      const eventIds = item.publishedEventIds?.length
        ? item.publishedEventIds
        : nip94Event
          ? [nip94Event.eventId]
          : [];

      if (effective.relayUrls.length > 0 && eventIds.length) {
        await publishDeletionEvent(
          resolvedSigner,
          effective.relayUrls,
          eventIds,
          'Deleted via Blossom Media Widget',
        );
      }

      // 3) Remove from local state immediately
      items = removeHistoryItemByUrl(items, item.url);
      // Also remove derivative blobs from items
      if (nip94Event) {
        for (const dUrl of [nip94Event.thumbUrl, nip94Event.imageUrl]) {
          if (dUrl) items = removeHistoryItemByUrl(items, dUrl);
        }
      }

      if (nip94Data) {
        nip94Data = {
          ...nip94Data,
          events: nip94Data.events.filter((ev) => {
            if (ev.url === item.url) return false;
            if (
              item.sha256 &&
              ev.sha256 &&
              item.sha256.toLowerCase() === ev.sha256.toLowerCase()
            )
              return false;
            return true;
          }),
        };
      }

      config.onDelete?.(item.url);
    } catch (err) {
      config.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Extract SHA-256 hash from a blossom blob URL.
   * Blossom URLs follow the pattern: https://server/<sha256> or https://server/<sha256>.ext
   */
  function extractSha256FromUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const lastSegment = pathname.split('/').pop() ?? '';
      const withoutExt = lastSegment.replace(/\.[^.]+$/, '');
      if (/^[0-9a-f]{64}$/i.test(withoutExt)) return withoutExt.toLowerCase();
      return null;
    } catch {
      return null;
    }
  }

  // ── Handle edit metadata ──────────────────────────────────────────────────
  let editPreviousTab = $state<TabId>('gallery');
  let editSaving = $state(false);

  function handleEditMetadata(item: UploadHistoryItem) {
    editItem = item;
    editPreviousTab = activeTab; // remember which tab we came from
  }

  async function handleEditMetadataSubmit(metadata: import('../core/metadata').ImageMetadataInput) {
    if (!editItem) return;
    const resolvedSigner = signer;
    if (!resolvedSigner) return;

    editSaving = true;
    try {
      // Build updated NIP-94 tags from the existing upload tags + new metadata
      const uploadTags = editItem.uploadTags ?? [];
      const newTags = buildImageMetadataTags(uploadTags, metadata);

      // 1) Publish new NIP-94 kind 1063 event
      if (effective.relayUrls.length > 0) {
        const result = await publishEvent(
          resolvedSigner,
          effective.relayUrls,
          metadata.description || '',
          newTags,
          1063,
        );

        const newEventId = (result.event as Record<string, unknown>).id as string;

        // 2) Delete old NIP-94 event(s) via NIP-09
        const oldEventIds = editItem.publishedEventIds?.filter((id) => id !== newEventId) ?? [];
        if (oldEventIds.length > 0) {
          try {
            await publishDeletionEvent(
              resolvedSigner,
              effective.relayUrls,
              oldEventIds,
              'Replaced by updated NIP-94 event',
            );
          } catch {
            // Non-fatal: old event stays but new one supersedes it
          }
        }

        // 3) Update nip94Data locally so gallery shows changes immediately
        if (nip94Data) {
          // Remove old event(s)
          const updatedEvents = nip94Data.events.filter(
            (ev) => ev.url !== editItem!.url &&
              !(editItem!.sha256 && ev.sha256 && editItem!.sha256.toLowerCase() === ev.sha256.toLowerCase()),
          );

          // Parse the new event into a Nip94FileEvent-like structure
          const createdAt = (result.event as Record<string, unknown>).created_at as number;

          // Re-fetch NIP-94 data from relay to get properly parsed event
          // For immediate feedback, manually construct the parsed event
          const getTag = (tags: string[][], key: string) =>
            tags.find((t) => t[0] === key)?.[1]?.trim() ?? '';
          const getAllTags = (tags: string[][], key: string) =>
            tags.filter((t) => t[0] === key).map((t) => t[1]?.trim()).filter(Boolean) as string[];

          const parseAiMode = (tags: string[][]): 'generated' | 'assisted' | undefined => {
            const hints = getAllTags(tags, 'hint');
            if (hints.includes('ai-image-generated')) return 'generated';
            if (hints.includes('ai-image-assisted')) return 'assisted';
            return undefined;
          };

          updatedEvents.unshift({
            eventId: newEventId,
            createdAt: createdAt ?? Math.floor(Date.now() / 1000),
            content: metadata.description || '',
            url: getTag(newTags, 'url') || editItem.url,
            sha256: getTag(newTags, 'x') || editItem.sha256 || '',
            mime: getTag(newTags, 'm') || editItem.mime || '',
            tags: newTags,
            thumbUrl: getTag(newTags, 'thumb') || undefined,
            imageUrl: getTag(newTags, 'image') || undefined,
            metadata,
          });

          nip94Data = {
            events: updatedEvents,
            byUrl: new Map(updatedEvents.map((e) => [e.url, e])),
            bySha256: new Map(
              updatedEvents
                .filter((e) => e.sha256)
                .map((e) => [e.sha256.toLowerCase(), e]),
            ),
          };
        }
      }

      // Also update local items
      items = updateHistoryItemByUrl(items, editItem.url, { metadata });
    } catch (err) {
      config.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      editSaving = false;
      editItem = null;
      activeTab = editPreviousTab; // return to gallery (or wherever we came from)
    }
  }

  // ── Event emitter for plugin context ──────────────────────────────────────
  const _emitter = createEventEmitter<WidgetEventMap>();

  // ── Widget context (shared with plugins) ──────────────────────────────────
  // Uses getters so plugins always read current values without deep-proxy issues.
  const widgetContext: WidgetContext = {
    get signer() { return signer; },
    get servers() { return effective.servers; },
    get relayUrls() { return effective.relayUrls; },
    get items() { return items; },
    get nip94Data() { return nip94Data; },
    get userSettings() { return userSettings; },
    get activeTab() { return activeTab; },
    get targetElement() { return _targetElement ?? null; },
    get config() { return config; },

    insert: (result: InsertResult) => handleInserted(result),
    refreshGallery: () => loadGalleryIfNeeded(),
    close: () => { open = false; onClose?.(); },
    switchTab: (tabId: string) => { activeTab = tabId; editItem = null; },
    reportError: (error: Error) => config.onError?.(error),

    on: (event, handler) => _emitter.on(event, handler),
    off: (event, handler) => _emitter.off(event, handler),
  };

  // ── Emit context events on state changes ──────────────────────────────────
  $effect(() => {
    _emitter.emit('signer-changed', signer);
  });
  $effect(() => {
    _emitter.emit('settings-changed', userSettings);
  });
  $effect(() => {
    // Emit after gallery load completes (track items + nip94Data)
    if (!galleryLoading) {
      _emitter.emit('gallery-loaded', { items, nip94Data });
    }
  });
  $effect(() => {
    _emitter.emit('tab-changed', activeTab);
  });
  $effect(() => {
    if (open) {
      _emitter.emit('open', undefined as unknown as void);
    } else {
      _emitter.emit('close', undefined as unknown as void);
    }
  });

  // ── Plugin tab lifecycle ──────────────────────────────────────────────────
  let previousActiveTab = $state<string>('');
  $effect(() => {
    const current = activeTab;
    if (current === previousActiveTab) return;
    const prev = previousActiveTab;
    previousActiveTab = current;

    // Deactivate previous plugin tab
    const prevPlugin = tabs.find(t => t.id === prev)?.plugin;
    if (prevPlugin?.onDeactivate) prevPlugin.onDeactivate(widgetContext);

    // Activate current plugin tab
    const curPlugin = tabs.find(t => t.id === current)?.plugin;
    if (curPlugin?.onActivate) curPlugin.onActivate(widgetContext);
  });

  // ── Custom tab container (legacy + plugin) ────────────────────────────────
  let customContainers = $state<Record<string, HTMLElement>>({});
  /** Tracks which containers have been rendered into (to avoid double-render). */
  let renderedContainers = $state<Record<string, boolean>>({});
  /** Tracks mounted Svelte plugin component instances for cleanup. */
  let mountedPluginComponents: Record<string, ReturnType<typeof svelteMount>> = {};
  /** Tracks cleanup functions returned by plugin render(). */
  let pluginCleanups: Record<string, (() => void) | undefined> = {};

  $effect(() => {
    for (const tab of tabs) {
      const el = customContainers[tab.id];
      if (!el || renderedContainers[tab.id]) continue;

      if (tab.custom) {
        // Legacy CustomTab: render(container)
        tab.custom.render(el);
        renderedContainers[tab.id] = true;
      } else if (tab.plugin) {
        if (tab.plugin.component) {
          // Svelte 5 component plugin
          const comp = svelteMount(tab.plugin.component, {
            target: el,
            props: { ctx: widgetContext },
          });
          mountedPluginComponents[tab.id] = comp;
          renderedContainers[tab.id] = true;
        } else if (tab.plugin.render) {
          // Vanilla DOM plugin
          const cleanup = tab.plugin.render(el, widgetContext);
          if (cleanup) pluginCleanups[tab.id] = cleanup;
          renderedContainers[tab.id] = true;
        }
      }
    }
  });

  // Cleanup plugin components and render functions on destroy
  // (called via Svelte 5's $effect cleanup when component unmounts)
  $effect(() => {
    return () => {
      // Destroy all mounted Svelte plugin components
      for (const [id, comp] of Object.entries(mountedPluginComponents)) {
        try { svelteUnmount(comp); } catch { /* ignore */ }
      }
      mountedPluginComponents = {};

      // Call cleanup functions from vanilla render plugins
      for (const [id, cleanup] of Object.entries(pluginCleanups)) {
        try { cleanup?.(); } catch { /* ignore */ }
      }
      pluginCleanups = {};

      // Notify all plugins of destroy
      for (const tab of tabs) {
        if (tab.plugin?.onDestroy) {
          try { tab.plugin.onDestroy(widgetContext); } catch { /* ignore */ }
        }
      }

      _emitter.clear();
    };
  });

  // ── Keyboard close ───────────────────────────────────────────────────────
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      open = false;
      onClose?.();
    }
  }

  // ── Pending upload recovery ───────────────────────────────────────────────
  let pendingUploads = $state<PendingUpload[]>([]);
  let pendingRecoveryActive = $state(false);
  let pendingCurrentIndex = $state(0);
  let pendingPublishing = $state(false);
  let pendingDeleting = $state(false);
  let pendingError = $state('');

  /** The currently shown pending upload (if recovery is active). */
  let currentPending = $derived.by(() =>
    pendingRecoveryActive && pendingCurrentIndex < pendingUploads.length
      ? pendingUploads[pendingCurrentIndex]
      : null,
  );

  /** Load pending uploads from localStorage (called on dialog open). */
  function loadPendingIfNeeded() {
    const appId = config.appId ?? 'default';
    pendingUploads = loadPendingUploads(appId);
    // Reset recovery state
    pendingRecoveryActive = false;
    pendingCurrentIndex = 0;
    pendingPublishing = false;
    pendingDeleting = false;
    pendingError = '';
  }

  /** Start the sequential recovery flow. */
  function startPendingRecovery() {
    pendingCurrentIndex = 0;
    pendingRecoveryActive = true;
    pendingError = '';
  }

  /** Advance to next pending or finish recovery. */
  function advancePending() {
    // Reload from localStorage to reflect removals
    const appId = config.appId ?? 'default';
    pendingUploads = loadPendingUploads(appId);
    pendingError = '';

    if (pendingUploads.length === 0) {
      pendingRecoveryActive = false;
      pendingCurrentIndex = 0;
      return;
    }

    // Stay at index 0 since we always remove the current item
    pendingCurrentIndex = 0;
  }

  /** Publish metadata for the current pending upload and remove it. */
  async function handlePendingPublish(metadata: import('../core/metadata').ImageMetadataInput) {
    const pending = currentPending;
    if (!pending || !signer) return;

    pendingPublishing = true;
    pendingError = '';

    try {
      const { insertResult } = await publishMediaMetadata({
        signer,
        relayUrls: effective.relayUrls,
        url: pending.url,
        mime: pending.mime,
        uploadTags: pending.uploadTags,
        metadata,
      });

      // Remove from pending list
      removePendingUpload(config.appId ?? 'default', pending.id);

      // Notify host
      handleInserted(insertResult);

      // Don't close dialog — advance to next pending or finish
      // (handleInserted closes the dialog, so re-open is handled by the host)
      // Actually, for recovery flow we want to continue, so re-set open
      open = true;
      advancePending();
    } catch (err) {
      pendingError = err instanceof Error ? err.message : 'Publish fehlgeschlagen.';
    } finally {
      pendingPublishing = false;
    }
  }

  /** Delete the current pending upload from Blossom servers and remove from localStorage. */
  async function handlePendingDelete() {
    const pending = currentPending;
    if (!pending || !signer) return;

    pendingDeleting = true;
    pendingError = '';

    try {
      // Delete main blob
      if (pending.sha256 && pending.servers.length > 0) {
        try {
          await deleteBlossomBlob(signer, pending.servers, pending.sha256);
        } catch { /* partial failure acceptable */ }
      }

      // Delete related blobs (thumb, image preview)
      for (const hash of pending.relatedHashes) {
        try {
          await deleteBlossomBlob(signer, pending.servers, hash);
        } catch { /* partial failure acceptable */ }
      }

      // Remove from pending list
      removePendingUpload(config.appId ?? 'default', pending.id);

      config.onDelete?.(pending.url);

      advancePending();
    } catch (err) {
      pendingError = err instanceof Error ? err.message : 'Löschen fehlgeschlagen.';
    } finally {
      pendingDeleting = false;
    }
  }

  /** Skip current pending without publishing or deleting (dismissed for this session). */
  function handlePendingSkip() {
    // We don't remove from localStorage — it will show again next time.
    // Just move to the next one in the list for this session.
    if (pendingCurrentIndex + 1 < pendingUploads.length) {
      pendingCurrentIndex++;
      pendingError = '';
    } else {
      pendingRecoveryActive = false;
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialogEl}
  class="bm-dialog"
  onclose={handleDialogClose}
  onclick={handleDialogClick}
  onkeydown={handleKeydown}
>
  <div class="bm-dialog-inner" role="document">
    <!-- Header -->
    <header class="bm-header">
      <h2 class="bm-title">Serverless Nostr Media</h2>
      <div class="bm-header-actions">
        <button
          type="button"
          class="bm-settings-btn"
          class:active={settingsOpen}
          aria-label="Einstellungen"
          onclick={() => { settingsOpen = !settingsOpen; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          {#if signer}
            <span class="bm-signer-dot"></span>
          {/if}
        </button>
        <button
          type="button"
          class="bm-close"
          aria-label="Schließen"
          onclick={() => { open = false; onClose?.(); }}
        >✕</button>
      </div>
    </header>

    <!-- Tab bar -->
    {#if tabs.length > 1}
      <div class="bm-tabs" role="tablist">
        {#each tabs as tab}
          <button
            type="button"
            role="tab"
            class="bm-tab"
            class:active={activeTab === tab.id}
            aria-selected={activeTab === tab.id}
            onclick={() => { activeTab = tab.id; editItem = null; }}
          >{#if tab.icon}<span class="bm-tab-icon">{tab.icon}</span>{/if}{tab.label}</button>
        {/each}
      </div>
    {/if}

    <!-- Content area -->
    <div class="bm-content">
      {#if settingsOpen}
        <!-- Settings overlay -->
        <SettingsPanel
          settings={userSettings}
          {signer}
          relayUrls={effective.relayUrls}
          appId={config.appId ?? 'default'}
          bunkerConnected={bunkerSession !== null}
          registeredPlugins={(config.plugins ?? []).map(p => ({ id: p.id, label: p.label, icon: p.icon }))}
          onClose={() => { settingsOpen = false; }}
          onSettingsChanged={handleSettingsChanged}
          onBunkerConnected={handleBunkerConnected}
          onBunkerDisconnect={handleBunkerDisconnect}
        />
      {:else if pendingRecoveryActive && currentPending}
        <!-- Pending upload recovery overlay -->
        <div class="bm-pending-overlay">
          <div class="pending-overlay-header">
            <button type="button" class="btn-back" onclick={() => { pendingRecoveryActive = false; }}>← Zurück</button>
            <span class="pending-title">
              Upload vervollständigen ({pendingCurrentIndex + 1} von {pendingUploads.length}): {currentPending.fileName}
            </span>
          </div>
          {#if pendingPublishing}
            <div class="pending-status">
              <span class="pending-spinner">📡</span> Veröffentliche Metadaten…
            </div>
          {:else if pendingDeleting}
            <div class="pending-status">
              <span class="pending-spinner">🗑️</span> Lösche Upload vom Server…
            </div>
          {:else}
            <MetadataSidebar
              fileUrl={currentPending.url}
              mime={currentPending.mime}
              thumbnailUrl={currentPending.uploadTags.find((t) => t[0] === 'thumb')?.[1]}
              mode="create"
              {visionOptions}
              showDelete={false}
              showMetadata={config.features?.metadata !== false}
              onSubmit={handlePendingPublish}
              onCancel={handlePendingSkip}
              onDeleteUpload={handlePendingDelete}
            />
          {/if}
          {#if pendingError}
            <p class="pending-error">{pendingError}</p>
          {/if}
        </div>
      {:else if editItem}
        <!-- Edit-metadata overlay (shown on top, tabs stay mounted underneath) -->
        <div class="bm-edit-overlay">
          <div class="edit-overlay-header">
            <button type="button" class="btn-back" onclick={() => { editItem = null; activeTab = editPreviousTab; }}>← Zurück</button>
            <span>Metadaten bearbeiten: {editItem.metadata?.description ?? editItem.url}</span>
          </div>
          <MetadataSidebar
            fileUrl={editItem.url}
            mime={editItem.mime ?? 'application/octet-stream'}
            thumbnailUrl={editItem.uploadTags?.find((t) => t[0] === 'thumb')?.[1]}
            initialMetadata={editItem.metadata}
            mode="edit"
            {visionOptions}
            showDelete={false}
            showMetadata={true}
            onSubmit={handleEditMetadataSubmit}
            onCancel={() => { editItem = null; activeTab = editPreviousTab; }}
          />
        </div>
      {/if}

      <!-- Pending uploads banner (outside tabs-content so it doesn't affect grid layout) -->
      {#if !settingsOpen && !pendingRecoveryActive && !editItem && pendingUploads.length > 0 && signer}
        <div class="bm-pending-banner">
          <span class="pending-banner-icon">⚠️</span>
          <span class="pending-banner-text">
            {pendingUploads.length === 1
              ? '1 Datei wurde hochgeladen, aber nicht publiziert.'
              : `${pendingUploads.length} Dateien wurden hochgeladen, aber nicht publiziert.`}
          </span>
          <button type="button" class="btn-pending-action" onclick={startPendingRecovery}>
            Jetzt vervollständigen
          </button>
        </div>
      {/if}

      <!-- Tabs always stay mounted so selection state is preserved -->
      <div class="bm-tabs-content" hidden={!!editItem || pendingRecoveryActive}>
        {#each tabs as tab}
          <div
            class="bm-tab-panel"
            class:active={activeTab === tab.id}
            role="tabpanel"
            hidden={activeTab !== tab.id}
          >
            {#if tab.builtin === 'upload'}
              <UploadTab
                {signer}
                servers={effective.servers}
                relayUrls={effective.relayUrls}
                features={config.features ?? {}}
                {visionOptions}
                appId={config.appId ?? 'default'}
                onInserted={handleInserted}
              />
            {:else if tab.builtin === 'gallery'}
              <GalleryTab
                {items}
                {nip94Data}
                loading={galleryLoading}
                loadError={galleryError}
                {signer}
                servers={effective.servers}
                relayUrls={effective.relayUrls}
                features={config.features ?? {}}
                {visionOptions}
                targetElement={_targetElement}
                {shareTargets}
                {widgetContext}
                onInserted={handleInserted}
                onDelete={handleDelete}
                onRefresh={loadGalleryIfNeeded}
                onEditMetadata={config.features?.metadata !== false ? handleEditMetadata : undefined}
              />
            {:else if tab.builtin === 'imagegen' && resolvedImageGenEndpoint}
              <ImageGenTab
                {signer}
                servers={effective.servers}
                relayUrls={effective.relayUrls}
                features={config.features ?? {}}
                {visionOptions}
                imageGenEndpoint={resolvedImageGenEndpoint}
                onInserted={handleInserted}
              />
            {:else if tab.custom || tab.plugin}
              <div
                bind:this={customContainers[tab.id]}
                class="bm-custom-tab bm-plugin-tab"
                data-plugin-id={tab.plugin?.id ?? tab.custom?.id}
              ></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</dialog>

<style>
  /* Note: these styles are scoped to the component.
     The widget host injects a full reset + this compiled CSS into the Shadow DOM. */

  /* ── Design tokens ── */
  .bm-dialog {
    --bm-bg: #ffffff;
    --bm-bg-subtle: #f8f8f8;
    --bm-bg-muted: #f0f0f0;
    --bm-bg-hover: #f5f5f5;
    --bm-text: #222222;
    --bm-text-muted: #777777;
    --bm-text-subtle: #888888;
    --bm-border: #e8e8e8;
    --bm-border-muted: #eee;
    --bm-accent: #6c63ff;
    --bm-accent-hover: #5a52d5;
    --bm-accent-bg: #c5c2ff;
    --bm-accent-bg-subtle: #f0eeff;
    --bm-danger: #c0392b;
    --bm-danger-bg: #fdf0ee;
    --bm-danger-border: #f0c8c2;
    --bm-input-bg: #ffffff;
    --bm-input-border: #ccc;
    --bm-shadow: 0 8px 40px rgba(0, 0, 0, 0.22);
    --bm-backdrop: rgba(0, 0, 0, 0.45);
    --bm-dropzone-bg: #faf9ff;
    --bm-dropzone-border: #c0bfff;
  }

  @media (prefers-color-scheme: dark) {
    .bm-dialog {
      --bm-bg: #1e1e2e;
      --bm-bg-subtle: #2a2a3c;
      --bm-bg-muted: #333348;
      --bm-bg-hover: #3a3a50;
      --bm-text: #e0e0e6;
      --bm-text-muted: #9999aa;
      --bm-text-subtle: #888899;
      --bm-border: #3a3a50;
      --bm-border-muted: #333348;
      --bm-accent: #8b83ff;
      --bm-accent-hover: #7a72ee;
      --bm-accent-bg: rgba(139, 131, 255, 0.3);
      --bm-accent-bg-subtle: rgba(139, 131, 255, 0.1);
      --bm-danger: #e74c3c;
      --bm-danger-bg: rgba(231, 76, 60, 0.15);
      --bm-danger-border: rgba(231, 76, 60, 0.3);
      --bm-input-bg: #2a2a3c;
      --bm-input-border: #4a4a5e;
      --bm-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
      --bm-backdrop: rgba(0, 0, 0, 0.65);
      --bm-dropzone-bg: rgba(139, 131, 255, 0.06);
      --bm-dropzone-border: rgba(139, 131, 255, 0.35);
    }
  }

  .bm-dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    padding: 0;
    border: none;
    border-radius: 12px;
    box-shadow: var(--bm-shadow);
    width: min(95vw, 1200px);
    height: min(95vh, 900px);
    background: var(--bm-bg);
    color: var(--bm-text);
    overflow: hidden;
  }

  .bm-dialog[open] {
    display: flex;
    flex-direction: column;
  }

  .bm-dialog::backdrop {
    background: var(--bm-backdrop);
    backdrop-filter: blur(2px);
  }

  .bm-dialog-inner {
    display: grid;
    grid-template-rows: auto auto 1fr;
    height: 100%;
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    color: var(--bm-text);
  }

  /* ── Header ── */
  .bm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--bm-border);
  }

  .bm-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .bm-close {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--bm-text-subtle);
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    line-height: 1;
  }

  .bm-close:hover {
    background: var(--bm-bg-hover);
    color: var(--bm-text);
  }

  /* ── Header actions (settings + close) ── */
  .bm-header-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .bm-settings-btn {
    position: relative;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--bm-text-subtle);
    padding: 0.3rem;
    border-radius: 4px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background 0.15s;
  }

  .bm-settings-btn:hover,
  .bm-settings-btn.active {
    background: var(--bm-bg-hover);
    color: var(--bm-accent);
  }

  .bm-signer-dot {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    border: 1.5px solid var(--bm-bg);
  }

  /* ── Tabs ── */
  .bm-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--bm-border);
    padding: 0 0.75rem;
  }

  .bm-tab {
    font: inherit;
    font-size: 0.875rem;
    padding: 0.6rem 1rem;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    color: var(--bm-text-muted);
    position: relative;
    top: 1px;
    transition: color 0.15s, border-color 0.15s;
  }

  .bm-tab.active {
    color: var(--bm-accent);
    border-bottom-color: var(--bm-accent);
    font-weight: 600;
  }

  .bm-tab:hover:not(.active) {
    color: var(--bm-text);
  }

  /* ── Content ── */
  .bm-content {
    overflow: hidden;
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
  }

  .bm-tabs-content {
    display: grid;
    overflow: hidden;
    min-height: 0;
  }

  .bm-tabs-content[hidden] {
    display: none;
  }

  .bm-tab-panel {
    overflow: hidden;
    display: none;
    min-height: 0;
  }

  .bm-tab-panel.active,
  .bm-tab-panel:not([hidden]) {
    display: grid;
    overflow: hidden;
  }

  .bm-custom-tab {
    overflow: auto;
    padding: 0.75rem;
  }

  .bm-plugin-tab {
    /* Plugin tabs get the same layout as custom tabs */
    min-height: 0;
  }

  .bm-tab-icon {
    margin-right: 0.35em;
  }

  /* ── Edit metadata overlay ── */
  .bm-edit-overlay {
    display: grid;
    gap: 0.5rem;
    padding: 0.5rem;
    overflow-y: auto;
  }

  .edit-overlay-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--bm-text-muted);
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--bm-border-muted);
  }

  .btn-back {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.3rem 0.6rem;
    background: var(--bm-bg-muted);
    border: 1px solid var(--bm-input-border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--bm-text);
  }

  .btn-back:hover {
    background: var(--bm-bg-hover);
  }

  /* ── Pending uploads banner ── */
  .bm-pending-banner {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.75rem;
    background: var(--bm-accent-bg-subtle, #f0eeff);
    border-bottom: 1px solid var(--bm-accent, #6c63ff);
    font-size: 0.8rem;
    color: var(--bm-text);
    height: fit-content;
  }

  .pending-banner-icon {
    font-size: 0.9rem;
    line-height: 1;
  }

  .pending-banner-text {
    flex: 1;
  }

  .btn-pending-action {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.3rem 0.7rem;
    background: var(--bm-accent, #6c63ff);
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s;
  }

  .btn-pending-action:hover {
    background: var(--bm-accent-hover, #5a52d5);
  }

  /* ── Pending upload recovery overlay ── */
  .bm-pending-overlay {
    display: grid;
    gap: 0.5rem;
    padding: 0.5rem;
    overflow-y: auto;
  }

  .pending-overlay-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--bm-text-muted);
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--bm-border-muted);
  }

  .pending-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pending-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 2rem;
    justify-content: center;
    font-size: 0.9rem;
    color: var(--bm-text-muted);
  }

  .pending-spinner {
    font-size: 1.5rem;
    animation: bm-pulse 1.2s infinite ease-in-out;
  }

  @keyframes bm-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .pending-error {
    font-size: 0.85rem;
    color: var(--bm-danger, #c0392b);
    padding: 0.25rem 0.75rem;
    margin: 0;
  }
</style>
