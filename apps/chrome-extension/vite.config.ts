import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { createManifest } from './manifest.config';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, __dirname, 'VITE_SIGNVERSE_');

  return {
    publicDir: false,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'signverse-manifest',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'manifest.json',
            source: `${JSON.stringify(createManifest(environment.VITE_SIGNVERSE_BACKEND_URL), null, 2)}\n`,
          });
        },
      },
    ],
    build: {
      emptyOutDir: true,
      outDir: 'dist',
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'popup.html'),
          background: resolve(__dirname, 'background/index.ts'),
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name === 'background' ? '[name].js' : 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
