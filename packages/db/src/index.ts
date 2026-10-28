import './net';
import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import ws from 'ws';
import * as schema from './schema';

// Node has no reliable global WebSocket for the Neon driver (Pool needs it for transactions).
neonConfig.webSocketConstructor = ws;

export * from './schema';
export * as tables from './schema';
export { schema };
export { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
export { alias } from 'drizzle-orm/pg-core';

/** Anything you can run `select/insert/update/delete` on: the HTTP db or a transaction. */
export type Reader = PgDatabase<any, typeof schema>;

const url = () => {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error('DATABASE_URL is not set');
  return u;
};

const g = globalThis as unknown as {
  __db?: ReturnType<typeof createDb>;
  __txDb?: ReturnType<typeof createTxDb>;
};

/**
 * Default client. Each query is its own HTTP request, so there are no idle sockets
 * to go stale — the right choice for pages and server actions. No interactive transactions.
 */
function createDb() {
  return drizzleHttp(neon(url()), { schema });
}
export function getDb() {
  return (g.__db ??= createDb());
}

/**
 * WebSocket pool for real transactions (scoring). Idle connections are dropped quickly
 * so we never hand out one that Neon has already closed.
 */
function createTxDb() {
  const pool = new Pool({ connectionString: url(), max: 5, idleTimeoutMillis: 10_000 });
  pool.on('error', (err) => console.error('[db] idle pool client error', err.message));
  return drizzleWs(pool, { schema });
}
export function getTxDb() {
  return (g.__txDb ??= createTxDb());
}
