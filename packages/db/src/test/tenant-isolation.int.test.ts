/**
 * AC-0.4: for every table, a user with no grant on org B gets zero rows from
 * org B under their own database role, and cannot write into it. Generated
 * from TENANT_TABLES, which is itself checked against the live schema.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withUser, type DbHandle } from "../client";
import { createAuthUser, dbErrorMessage, seedTenant, testDatabaseUrl, type SeededTenant, type TestUser } from "../testing";
import { NON_TENANT_TABLES, TENANT_TABLES, type TenantTable } from "../tenancy-registry";

let handle: DbHandle;
let a: SeededTenant;
let b: SeededTenant;
let outsider: TestUser;

beforeAll(async () => {
  handle = createDb(testDatabaseUrl());
  a = await seedTenant(handle.db, "alpha");
  b = await seedTenant(handle.db, "bravo");
  outsider = await createAuthUser(handle.db, "outsider");
});

afterAll(async () => {
  await handle.close();
});

const tables = Object.entries(TENANT_TABLES) as [TenantTable, { orgColumn: string }][];

describe("table registry", () => {
  it("lists every table in the public schema exactly once", async () => {
    const rows = await handle.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    );
    const actual = rows.map((r) => r.table_name).filter((t) => t !== "__drizzle_migrations");
    const registered = [...Object.keys(TENANT_TABLES), ...Object.keys(NON_TENANT_TABLES)].sort();
    expect(actual).toEqual(registered);
  });

  it("enables RLS on every public table", async () => {
    const rows = await handle.db.execute<{ relname: string }>(
      sql`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("has no grants for the anon role on any public table", async () => {
    const rows = await handle.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'`,
    );
    expect(rows).toEqual([]);
  });
});

describe.each(tables)("tenant isolation: %s", (table, { orgColumn }) => {
  const t = sql.identifier(table);
  const col = sql.identifier(orgColumn);

  it("the fixture seeds rows for org B (so the test below is meaningful)", async () => {
    const [row] = await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from ${t} where ${col} = ${b.orgId}`);
    expect(row?.n).toBeGreaterThan(0);
  });

  it("org A's owner sees zero rows from org B", async () => {
    const n = await withUser(handle.db, a.owner.claims, async (tx) => {
      const [row] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${t} where ${col} = ${b.orgId}`);
      return row?.n;
    });
    expect(n).toBe(0);
  });

  it("org A's owner sees only org A rows", async () => {
    const orgs = await withUser(handle.db, a.owner.claims, (tx) =>
      tx.execute<{ org: string }>(sql`select distinct ${col}::text as org from ${t}`),
    );
    expect(orgs.map((r) => r.org)).toEqual([a.orgId]);
  });

  it("a user with no grants anywhere sees nothing", async () => {
    const n = await withUser(handle.db, outsider.claims, async (tx) => {
      const [row] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${t}`);
      return row?.n;
    });
    expect(n).toBe(0);
  });

  it("org A's owner cannot update or delete org B rows", async () => {
    // A no-op update still has to pass the USING clause to touch a row.
    const touched = await withUser(handle.db, a.owner.claims, (tx) =>
      tx.execute(sql`update ${t} set ${col} = ${col} where ${col} = ${b.orgId}`),
    ).catch((e: unknown) => e);
    // Either RLS filters every row (0 updated) or the table refuses updates outright.
    if (touched instanceof Error) {
      expect(dbErrorMessage(touched)).toMatch(/permission denied|append-only/);
    } else {
      expect((touched as unknown as { count: number }).count).toBe(0);
    }

    const deleted = await withUser(handle.db, a.owner.claims, (tx) =>
      tx.execute(sql`delete from ${t} where ${col} = ${b.orgId}`),
    ).catch((e: unknown) => e);
    if (deleted instanceof Error) {
      expect(dbErrorMessage(deleted)).toMatch(/permission denied|append-only/);
    } else {
      expect((deleted as unknown as { count: number }).count).toBe(0);
    }

    const [still] = await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from ${t} where ${col} = ${b.orgId}`);
    expect(still?.n).toBeGreaterThan(0);
  });
});

describe("tenant isolation: writes into another org", () => {
  async function attempt(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<unknown>): Promise<unknown> {
    return withUser(handle.db, a.owner.claims, fn).then(
      () => null,
      (e: unknown) => e,
    );
  }

  it.each([
    ["memberships", () => sql`insert into memberships (org_id, user_id, role) values (${b.orgId}, ${a.owner.id}, 'org_admin')`],
    ["entities", () => sql`insert into entities (org_id, legal_name) values (${b.orgId}, 'Hijack Ltd')`],
    ["entity_access", () => sql`insert into entity_access (org_id, entity_id, user_id, role) values (${b.orgId}, ${b.entityId}, ${a.owner.id}, 'client_owner')`],
    ["user_entity_prefs", () => sql`insert into user_entity_prefs (org_id, entity_id, user_id, display_mode) values (${b.orgId}, ${b.entityId}, ${a.owner.id}, 'simple')`],
    ["invitations", () => sql`insert into invitations (org_id, email, role, token_hash, expires_at, invited_by) values (${b.orgId}, 'x@example.test', 'org_admin', ${randomUUID()}, now() + interval '1 day', ${a.owner.id})`],
    ["audit_log", () => sql`insert into audit_log (org_id, actor_user_id, action, target_type) values (${b.orgId}, ${a.owner.id}, 'forged', 'organisation')`],
  ])("cannot insert into %s for org B", async (_table, query) => {
    const err = await attempt((tx) => tx.execute(query()));
    expect(err).toBeInstanceOf(Error);
    expect(dbErrorMessage(err)).toMatch(/row-level security|violates/);
  });

  it("cannot claim ownership of an existing org", async () => {
    const err = await attempt((tx) => tx.execute(sql`insert into memberships (org_id, user_id, role) values (${b.orgId}, ${a.owner.id}, 'org_owner')`));
    expect(dbErrorMessage(err)).toMatch(/row-level security/);
  });
});

describe("tenant isolation: users", () => {
  it("users only see profiles of people they share an org or entity with", async () => {
    const ids = await withUser(handle.db, a.owner.claims, (tx) => tx.execute<{ id: string }>(sql`select id::text from users`));
    const seen = new Set(ids.map((r) => r.id));
    expect(seen).toEqual(new Set([a.owner.id, a.accountant.id, a.viewer.id]));
  });

  it("an outsider sees only their own profile", async () => {
    const ids = await withUser(handle.db, outsider.claims, (tx) => tx.execute<{ id: string }>(sql`select id::text from users`));
    expect(ids.map((r) => r.id)).toEqual([outsider.id]);
  });

  it("users cannot edit other people's profiles", async () => {
    const res = await withUser(handle.db, a.owner.claims, (tx) => tx.execute(sql`update users set full_name = 'x' where id = ${b.owner.id}`));
    expect((res as unknown as { count: number }).count).toBe(0);
  });
});
