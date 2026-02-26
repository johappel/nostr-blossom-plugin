/**
 * @blossom/plugin/widget — Entry Point
 *
 * Provides `init(config)` which:
 *  1. Creates a Shadow DOM host element and appends it to <body>
 *  2. Mounts the `MediaWidget` Svelte 5 component inside it
 *  3. Optionally starts the `Injector` to scan the page for target elements
 *  4. Returns a `BlossomMediaInstance` with open/close/destroy methods
 *
 * The IIFE build exposes this as `window.BlossomMedia.init(config)`.
 *
 * @example
 * ```html
 * <script src="blossom-media.iife.js"></script>
 * <script>
 *   const media = window.BlossomMedia.init({
 *     servers: ['https://blossom.example.com'],
 *     relayUrl: 'wss://relay.example.com',
 *     onInsert: (result) => console.log('Inserted', result.url),
 *   });
 * </script>
 * ```
 */

import { mount, unmount } from 'svelte';
import type { BlossomMediaConfig, BlossomMediaInstance, InsertResult } from './types';
import MediaWidget from './MediaWidget.svelte';
import { Injector } from './Injector';

export type { BlossomMediaConfig, BlossomMediaInstance, InsertResult };
export type { CustomTab, BlossomMediaFeatures, InsertMode } from './types';

/**
 * Minimal CSS reset injected into the Shadow DOM so that host-page styles
 * don't bleed into the widget and vice-versa.
 */
const SHADOW_RESET_CSS = `
:host {
  all: initial;
  font-family: system-ui, -apple-system, sans-serif;
}
*, *::before, *::after {
  box-sizing: border-box;
}
`;

/**
 * Initialise the Blossom Media Widget.
 *
 * @param config - Widget configuration (see `BlossomMediaConfig`)
 * @returns `BlossomMediaInstance` with `open()`, `close()`, and `destroy()`
 */
export function init(config: BlossomMediaConfig): BlossomMediaInstance {
  // ── Shadow DOM host ────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.setAttribute('data-blossom-media-host', '');
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });

  // Inject reset styles
  const styleEl = document.createElement('style');
  styleEl.textContent = SHADOW_RESET_CSS;
  shadowRoot.appendChild(styleEl);

  // Mount container inside shadow root
  const mountPoint = document.createElement('div');
  shadowRoot.appendChild(mountPoint);

  // ── State shared with the component ────────────────────────────────────
  let isOpen = false;
  let activeTarget: HTMLElement | undefined = undefined;

  // ── Mount Svelte component ─────────────────────────────────────────────
  const widgetProps = $state({
    config,
    open: false,
    targetElement: undefined as HTMLElement | undefined,
    onClose: () => {
      isOpen = false;
      activeTarget = undefined;
    },
  });

  const component = mount(MediaWidget, {
    target: mountPoint,
    props: widgetProps,
  });

  // ── Injector ────────────────────────────────────────────────────────────
  let injector: Injector | null = null;

  if (config.targets !== undefined || config.targets === undefined) {
    // Auto-start injector unless explicitly disabled via targets: []
    injector = new Injector({
      targetSelector: config.targets ?? '[data-blossom]',
      buttonLabel: '🌸 Mediathek',
      onOpen: (target) => {
        instance.open(target);
      },
      onSelect: (target, url) => {
        Injector.writeUrlToTarget(target, url);
      },
    });
    injector.start();
  }

  // ── Instance API ─────────────────────────────────────────────────────────
  const instance: BlossomMediaInstance = {
    open(targetElement?: HTMLElement) {
      isOpen = true;
      activeTarget = targetElement;
      widgetProps.targetElement = targetElement;
      widgetProps.open = true;
    },

    close() {
      isOpen = false;
      activeTarget = undefined;
      widgetProps.open = false;
    },

    destroy() {
      injector?.destroy();
      injector = null;
      unmount(component);
      host.remove();
    },
  };

  // Patch onInsert to auto-write URL back to target
  const originalOnInsert = config.onInsert;
  config.onInsert = (result: InsertResult) => {
    if (activeTarget) {
      Injector.writeUrlToTarget(activeTarget, result.url);
    }
    originalOnInsert?.(result, activeTarget ?? null);
    instance.close();
  };

  // Suppress unused-variable warning
  void isOpen;

  return instance;
}

/**
 * Auto-init from `<script data-blossom-config='…'>` tag.
 *
 * If the script tag that loaded this bundle has a `data-blossom-config`
 * attribute containing a JSON config object, `init()` is called automatically
 * after the DOM is ready.
 *
 * @example
 * ```html
 * <script src="blossom-media.iife.js"
 *   data-blossom-config='{"servers":["https://blossom.example.com"]}'
 * ></script>
 * ```
 */
if (typeof document !== 'undefined') {
  const selfScript = document.currentScript as HTMLScriptElement | null;
  const rawConfig = selfScript?.dataset.blossomConfig;

  if (rawConfig) {
    const run = () => {
      try {
        const parsedConfig = JSON.parse(rawConfig) as BlossomMediaConfig;
        init(parsedConfig);
      } catch (err) {
        console.error('[BlossomMedia] Failed to parse data-blossom-config:', err);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }
}
