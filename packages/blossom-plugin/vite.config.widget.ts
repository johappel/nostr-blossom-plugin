/**
 * Vite build config for the embeddable Blossom Media Widget.
 *
 * Produces two outputs:
 *   dist/widget/blossom-media.iife.js  — IIFE: window.BlossomMedia = { init }
 *   dist/widget/blossom-media.esm.js   — ES module: import { init } from '...'
 *
 * CSS is injected into the JS bundle (no separate .css file) so that a single
 * <script> tag is sufficient for embedding.
 *
 * Run with:
 *   pnpm --filter @blossom/plugin build:widget
 */

import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        // Compile Svelte components as HTML elements (not custom elements) since
        // we mount them ourselves inside a Shadow DOM root.
        runes: true,
      },
    }),
  ],

  build: {
    outDir: path.resolve(__dirname, 'dist/widget'),
    emptyOutDir: true,

    lib: {
      entry: path.resolve(__dirname, 'src/widget/index.ts'),
      name: 'BlossomMedia',
      formats: ['iife', 'es'],
      fileName: (format) =>
        format === 'iife' ? 'blossom-media.iife.js' : 'blossom-media.esm.js',
    },

    rollupOptions: {
      // Bundle everything — this is a self-contained embeddable script
      external: [],
      output: {
        // Inject CSS into JS to avoid needing a separate <link>
        inlineDynamicImports: true,
      },
    },

    // Keep reasonably small; widget does not need to support very old browsers
    target: 'es2020',
    minify: true,
    sourcemap: false,
  },

  css: {
    // Inject all component styles into the JS bundle
    // (Vite handles this automatically for lib mode when cssCodeSplit: false)
    codeSplit: false,
  },
});
