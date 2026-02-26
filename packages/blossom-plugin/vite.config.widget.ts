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

import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Rollup plugin that:
 *  1. Collects all CSS assets emitted during the build.
 *  2. Deletes them from the output (no standalone .css file).
 *  3. Prepends `var __BLOSSOM_CSS__ = "…"` to every entry chunk so that
 *     index.svelte.ts can read and inject the styles into the Shadow DOM.
 */
function injectCssIntoBundle(): Plugin {
  return {
    name: 'blossom-inject-css',
    enforce: 'post',
    generateBundle(_, bundle) {
      let css = '';
      const cssKeys: string[] = [];

      for (const [key, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'asset' && key.endsWith('.css')) {
          css +=
            typeof chunk.source === 'string'
              ? chunk.source
              : new TextDecoder().decode(chunk.source as Uint8Array);
          cssKeys.push(key);
        }
      }

      for (const key of cssKeys) {
        delete bundle[key];
      }

      if (!css) return;

      const cssVar = `var __BLOSSOM_CSS__=${JSON.stringify(css)};`;
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          chunk.code = cssVar + '\n' + chunk.code;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    injectCssIntoBundle(),
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
      entry: path.resolve(__dirname, 'src/widget/index.svelte.ts'),
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
});

