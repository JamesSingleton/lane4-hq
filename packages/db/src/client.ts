import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/postgres-js";
import postgresClient from "postgres";
import { getDatabaseUrl } from "./keys";
import * as schema from "./schema/index";

const connectionString = getDatabaseUrl();

const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgresClient> | undefined;
};

const client =
  globalForDb.client ??
  postgresClient(connectionString, {
    prepare: false,
    max: 25,
    idle_timeout: 20,
    connect_timeout: 10,
  });

globalForDb.client = client;

const rootDb = drizzle(client, { schema });

type Transaction = Parameters<Parameters<typeof rootDb.transaction>[0]>[0];

const activeTransaction = new AsyncLocalStorage<Transaction>();

/**
 * The database. Inside `inTransaction`, every query made through `db` (by
 * any query helper) runs in that transaction, so helpers don't need a `tx`
 * parameter to take part.
 */
export const db = new Proxy(rootDb, {
  get(target, prop) {
    const executor = (activeTransaction.getStore() ?? target) as typeof target;
    const value = Reflect.get(executor, prop, executor);
    return typeof value === "function" ? value.bind(executor) : value;
  },
}) as typeof rootDb;

export type Database = typeof db;

/**
 * Run `fn` in one transaction: if it throws, every write made through `db`
 * inside it rolls back. Nested calls join the outer transaction. Don't start
 * background work (`after`, unawaited queries) inside `fn`; it would outlive
 * the transaction.
 */
export async function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (activeTransaction.getStore()) return fn();
  return rootDb.transaction((tx) => activeTransaction.run(tx, fn));
}

/** Resolves once Postgres answers a trivial query. */
export async function pingDatabase(): Promise<void> {
  await client`select 1`;
}

/** Let in-flight queries finish (up to `timeoutSeconds`), then close the pool. */
export async function closeDatabase(timeoutSeconds = 5): Promise<void> {
  await client.end({ timeout: timeoutSeconds });
}
