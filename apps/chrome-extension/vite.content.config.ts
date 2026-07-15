import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [react()],
  build: {
    copyPublicDir: false,
    emptyOutDir: false,
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'content/generic-web/index.tsx'),
      formats: ['iife'],
      name: 'SignVerseContent',
      fileName: () => 'content.js',
    },
  },
});
