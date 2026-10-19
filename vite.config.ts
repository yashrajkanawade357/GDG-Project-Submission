import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs so the build works from any sub-path (GitHub Pages, Netlify, Vercel).
  base: './',
  build: {
    // three.js alone is ~530 kB minified (~135 kB gzipped); it is lazy-loaded on the landing page.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app/index.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
