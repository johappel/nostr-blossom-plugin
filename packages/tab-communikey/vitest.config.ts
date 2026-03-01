import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    alias: {
      '@blossom/plugin/plugin': path.resolve(__dirname, '../blossom-plugin/src/widget/plugin-api.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
