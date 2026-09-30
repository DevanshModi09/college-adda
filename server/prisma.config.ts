import fs from 'node:fs';
import { defineConfig } from 'prisma/config';

// The Prisma CLI doesn't read .env itself; on Render the variables come from the dashboard instead.
if (fs.existsSync('.env')) process.loadEnvFile('.env');

// Migrations run over Neon's direct (unpooled) connection; the app itself uses the pooled DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
});
