import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { runMigrations } from "../migrate";

const SHIM_PATH = fileURLToPath(new URL("./supabase-shim.sql", import.meta.url));

/**
 * Drops and recreates the database named in `url`, applies the Supabase shim
 * and runs every migration. Refuses anything that does not look like a local
 * test database.
 */
export async function resetTestDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, "");
  if (!/test/.test(dbName)) throw new Error(`Refusing to reset non-test database "${dbName}"`);
  if (!["localhost", "127.0.0.1", "::1", "postgres"].includes(target.hostname)) {
    throw new Error(`Refusing to reset database on non-local host "${target.hostname}"`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => undefined });
  try {
    await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
    await admin.unsafe(`create database "${dbName}"`);
  } finally {
    await admin.end();
  }

  const db = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await db.unsafe(readFileSync(SHIM_PATH, "utf8"));
  } finally {
    await db.end();
  }
  await runMigrations(url);
}

export const DEFAULT_TEST_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:54322/kedge_test";

export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
}

export * from "./fixtures";

/** The underlying Postgres message of a (possibly Drizzle-wrapped) error. */
export function dbErrorMessage(e: unknown): string {
  let current: unknown = e;
  const parts: string[] = [];
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" <- ");
}
