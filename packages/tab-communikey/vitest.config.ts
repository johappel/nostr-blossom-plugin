import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@blossom/plugin/plugin': path.resolve(__dirname, '../blossom-plugin/src/widget/plugin-api.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
