import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { env } from '../config/env.ts';

// One Prisma client for the process, talking to Neon over its pooled connection.
// Schema changes are Prisma migrations (prisma/migrations), applied with `npm run db:migrate`.

export type Db = PrismaClient;
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

let client: PrismaClient | null = null;
const txScope = new AsyncLocalStorage<Tx>();

function connect(): PrismaClient {
  if (!env.databaseUrl) throw new Error('DATABASE_URL is not set. Run `npx neon@latest env pull` or copy server/.env.example.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: env.databaseUrl }) });
}

/** The client to query with: the open transaction if we're inside one, else the shared client. */
export const db = (): Tx | PrismaClient => txScope.getStore() ?? (client ??= connect());

/**
 * Runs `fn` in a transaction; every repository call inside it (awaited) joins automatically.
 * `timeoutMs` overrides Prisma's 5 s limit for bulk jobs, where every query is a network round trip to Neon.
 */
export async function transaction<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
  if (txScope.getStore()) return fn(); // already inside one
  client ??= connect();
  return client.$transaction((tx) => txScope.run(tx, fn), timeoutMs ? { timeout: timeoutMs, maxWait: timeoutMs } : undefined);
}

export async function disconnect(): Promise<void> {
  await client?.$disconnect();
  client = null;
}
