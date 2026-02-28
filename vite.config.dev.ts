/**
 * Vite dev server for testing example pages.
 *
 * Usage:
 *   pnpm dev:community
 *
 * Opens examples/community-tab.html with HMR and workspace package resolution.
 */
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: { runes: true },
    }),
  ],

  resolve: {
    alias: {
      // Map package exports to source for dev (HMR + no pre-build needed)
      '@blossom/plugin/widget': path.resolve(__dirname, 'packages/blossom-plugin/src/widget/index.svelte.ts'),
      '@blossom/plugin/plugin': path.resolve(__dirname, 'packages/blossom-plugin/src/widget/plugin-api.ts'),
      '@blossom/plugin': path.resolve(__dirname, 'packages/blossom-plugin/src/index.ts'),
      '@blossom/tab-communikey': path.resolve(__dirname, 'packages/tab-communikey/src/index.ts'),
    },
  },

  server: {
    port: 5188,
    open: '/examples/community-tab.html',
  },
});
