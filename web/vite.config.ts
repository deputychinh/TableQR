import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The SPA and the API share one origin (ADR 0002): `/api` is proxied to the API process.
const apiTarget = `http://127.0.0.1:${process.env.TQR_API_PORT ?? '3310'}`;
const proxy = { '/api': { target: apiTarget, changeOrigin: false } };

// Production headers of the SPA (CSP and friends, TQR-022), shared with deploy/nginx.conf.example.
// `vite preview` sends them so the browser e2e journeys run under the production CSP; the dev
// server does not (its HMR client needs inline code and a websocket).
const securityHeaders = JSON.parse(
  readFileSync(new URL('../deploy/security-headers.json', import.meta.url), 'utf8'),
) as Record<string, string>;

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    // The manifest lets scripts/bundle-budget.mjs find the initial chunks.
    manifest: true,
    rollupOptions: {
      output: {
        // A guest on a phone opens one QR page: load its code in a few chunks, not dozens
        // (guest menu LCP target ≤ 2.5 s on slow 4G, benchmarks/plan.md).
        manualChunks: (id: string): string | undefined => {
          if (id.includes('node_modules/qrcode')) return 'qr';
          if (id.includes('node_modules/lucide-vue-next')) return 'icons';
          if (id.includes('node_modules')) return 'vendor';
          if (
            id.includes('/src/features/ordering/') ||
            id.includes('/src/features/billing/components/GuestBill')
          ) {
            return 'guest';
          }
          if (id.includes('/src/components/')) return 'ui';
          return undefined;
        },
      },
    },
  },
  // Loopback only; both localhost and 127.0.0.1 reach it.
  server: { host: '127.0.0.1', proxy },
  preview: { host: '127.0.0.1', proxy, headers: securityHeaders },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
