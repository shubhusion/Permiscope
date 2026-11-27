import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: process.env.VITE_BASE ?? '/',
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
