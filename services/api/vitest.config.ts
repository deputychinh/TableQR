import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/**/domain/**/*.ts',
        'src/**/*.service.ts',
        'src/config/**/*.ts',
        'src/common/errors/problem.ts',
        'src/common/logging/redact.ts',
        'src/common/logging/app-logger.ts',
      ],
      exclude: ['src/**/*.spec.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
