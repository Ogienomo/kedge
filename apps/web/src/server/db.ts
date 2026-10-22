import { createDb, type Database } from "@kedge/db";
import { serverEnv } from "./env";

const globalForDb = globalThis as unknown as { kedgeDb?: Database };

/** One connection pool per server process (survives dev hot reloads). */
export function getDb(): Database {
  globalForDb.kedgeDb ??= createDb(serverEnv().DATABASE_URL).db;
  return globalForDb.kedgeDb;
}
