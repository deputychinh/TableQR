import { fileURLToPath } from 'node:url';
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,vue}'],
        exclude: [
          'src/**/*.test.ts',
          'src/main.ts',
          'src/router/**',
          'src/app/pages/**',
          'src/App.vue',
          'src/test/**',
        ],
        thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      },
    },
  }),
);
