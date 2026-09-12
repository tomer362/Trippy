import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/env";
import * as schema from "./schema";

type Database = ReturnType<typeof createDb>;

function createDb() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. See docs/SETUP.md.");
  }
  const sql = neon(env.DATABASE_URL);
  return drizzle({ client: sql, schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { __trippyDb?: Database };

function getDb(): Database {
  if (!globalForDb.__trippyDb) globalForDb.__trippyDb = createDb();
  return globalForDb.__trippyDb;
}

/**
 * Lazily-initialised Drizzle client. Importing this module never touches the network,
 * so builds and unit tests work without a database; the first query creates the client.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type Db = Database;
export { schema };
