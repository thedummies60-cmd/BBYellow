import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  /*
   * Relative base — REQUIRED. We deploy to a third-party static host and may be
   * served from any subdirectory. Absolute '/assets/...' paths break there.
   * See docs/deployment.md.
   */
  base: './',

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

  build: {
    target: 'es2022',
    sourcemap: true, // hidden from users, essential for reading production stack traces
    assetsInlineLimit: 0, // keep assets as separate hashed files so caching is predictable
    rollupOptions: {
      output: {
        // Content hashes: the host gives us no cache-control, so filenames do the work.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          // Three.js is large and changes rarely — its own chunk survives game updates
          // in the player's cache.
          three: ['three'],
        },
      },
    },
  },

  server: {
    port: 5173,
  },
});
