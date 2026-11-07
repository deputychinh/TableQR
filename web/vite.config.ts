import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Loopback only; both localhost and 127.0.0.1 reach it (the API allows both origins).
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
