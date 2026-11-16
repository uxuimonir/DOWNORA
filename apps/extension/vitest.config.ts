import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'https://site.example/watch/page.html' } },
  },
});
