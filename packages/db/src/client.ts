import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface DbHandle {
  readonly db: Database;
  readonly close: () => Promise<void>;
}

export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  // `prepare: false` keeps us compatible with Supabase's transaction pooler.
  const client = postgres(url, { max: options.max ?? 10, prepare: false, onnotice: () => undefined });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}

/** Identity of the signed-in user, as carried in their Supabase JWT. */
export interface AuthClaims {
  readonly sub: string;
  readonly email: string;
  /** Authenticator assurance level: "aal2" once MFA has been verified. */
  readonly aal?: "aal1" | "aal2";
}

/**
 * Runs `fn` in one transaction as the given user: the connection switches to
 * the `authenticated` role with their JWT claims, so every query is subject
 * to RLS exactly as it would be for direct access with their token.
 */
export async function withUser<T>(db: Database, claims: AuthClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ ...claims, role: "authenticated" })}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}

/**
 * Runs `fn` in one transaction with the service role, which bypasses RLS.
 * Only for trusted server paths (pre-auth lookups, jobs, webhooks). Callers
 * must still scope every query and check permissions with can().
 */
export async function withServiceRole<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role service_role`);
    return fn(tx);
  });
}
