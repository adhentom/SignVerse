import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'https://www.youtube.com/watch?v=video-1',
      },
    },
    restoreMocks: true,
  },
});
