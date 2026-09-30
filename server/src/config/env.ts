import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3000),
  /** Neon pooled connection string (the app); migrations use DATABASE_URL_UNPOOLED. */
  databaseUrl: process.env.DATABASE_URL ?? '',
  clientDist: path.join(root, 'client/dist'),
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  /** Comma-separated usernames promoted to admin on boot. */
  adminUsernames: (process.env.ADMIN_USERNAMES ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
} as const;
