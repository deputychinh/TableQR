import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // Database-bound services, controllers and guards are measured through the HTTP layer.
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage-e2e',
      include: [
        'src/**/*.service.ts',
        'src/**/*.controller.ts',
        'src/**/guards.ts',
        'src/**/*.cookie.ts',
        'src/common/errors/problem.filter.ts',
        'src/common/http/*.ts',
        'src/common/logging/request-*.ts',
      ],
      thresholds: { lines: 90, functions: 90, branches: 75, statements: 90 },
    },
  },
});
