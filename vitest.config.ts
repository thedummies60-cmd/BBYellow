import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@platform': r('./src/platform'),
      '@render': r('./src/render'),
      '@audio': r('./src/audio'),
      '@input': r('./src/input'),
      '@game': r('./src/game'),
      '@ui': r('./src/ui'),
      '@shared': r('./src/shared'),
      '@app': r('./src/app'),
    },
  },
  test: {
    // 'node', not 'jsdom': core/ and game/ must stay headless (CLAUDE.md §2).
    // A test here needing a DOM means the code is in the wrong layer.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
