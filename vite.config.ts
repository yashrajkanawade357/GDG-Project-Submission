import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs so the build works from any sub-path (GitHub Pages, Netlify, Vercel).
  base: './',
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
