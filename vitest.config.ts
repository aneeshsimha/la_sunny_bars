import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'pipeline/**/*.test.ts'],
    env: {
      TZ: 'America/Los_Angeles',
    },
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/worker/**', 'src/state/**', 'src/data/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
