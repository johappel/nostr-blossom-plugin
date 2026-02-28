/**
 * Vite dev server for testing example pages.
 *
 * Usage:
 *   pnpm dev:community
 *
 * Opens examples/community-tab.html with HMR and workspace package resolution.
 * Uses css:'injected' so Svelte components inject their CSS at runtime into
 * Shadow DOM (Svelte 5 detects ShadowRoot via getRootNode().host).
 */
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        runes: true,
        // 'injected' = CSS is included in component JS and injected at runtime.
        // Svelte 5's append_styles() detects Shadow DOM via getRootNode().host
        // and injects <style> directly into the ShadowRoot instead of <head>.
        css: 'injected',
      },
      // Don't extract CSS to separate files — we rely on runtime injection.
      emitCss: false,
    }),
  ],

  // Provide __BLOSSOM_CSS__ as empty string for dev mode.
  // In production, this is populated by the injectCssIntoBundle Rollup plugin.
  // In dev mode, each component injects its own CSS via css:'injected'.
  define: {
    __BLOSSOM_CSS__: '""',
  },

  resolve: {
    alias: {
      // Map package exports to source for dev (HMR + no pre-build needed)
      '@blossom/plugin/widget': path.resolve(__dirname, 'packages/blossom-plugin/src/widget/index.svelte.ts'),
      '@blossom/plugin/plugin': path.resolve(__dirname, 'packages/blossom-plugin/src/widget/plugin-api.ts'),
      '@blossom/plugin': path.resolve(__dirname, 'packages/blossom-plugin/src/index.ts'),
      '@blossom/tab-communikey': path.resolve(__dirname, 'packages/tab-communikey/src/index.ts'),
      '@blossom/tab-oer-shares': path.resolve(__dirname, 'packages/tab-oer-shares/src/index.ts'),
    },
  },

  server: {
    port: 5188,
    open: '/examples/community-tab.html',
  },
});
