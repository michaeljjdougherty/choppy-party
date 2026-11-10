import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths so the build also runs from a sub-folder or a static host
  base: './',
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
  build: { outDir: 'dist' },
});
