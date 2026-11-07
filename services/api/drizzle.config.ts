import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.TQR_DATABASE_URL ?? 'postgresql://tableqr:tableqr@127.0.0.1:55432/tableqr',
  },
});
