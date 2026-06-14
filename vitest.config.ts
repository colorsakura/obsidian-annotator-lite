import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  define: {
    __DEBUG__: 'false',
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, '__mocks__/obsidian.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**'],
    },
  },
});
