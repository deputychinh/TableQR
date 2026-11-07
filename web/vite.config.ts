import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The SPA and the API share one origin (ADR 0002): `/api` is proxied to the API process.
const apiTarget = `http://127.0.0.1:${process.env.TQR_API_PORT ?? '3310'}`;
const proxy = { '/api': { target: apiTarget, changeOrigin: false } };

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Loopback only; both localhost and 127.0.0.1 reach it.
  server: { host: '127.0.0.1', proxy },
  preview: { host: '127.0.0.1', proxy },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
