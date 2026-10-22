/** AC-0.5: audit_log rejects UPDATE and DELETE (and TRUNCATE), for every role. */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withServiceRole, withUser, type DbHandle } from "../client";
import { dbErrorMessage, seedTenant, testDatabaseUrl, type SeededTenant } from "../testing";

let handle: DbHandle;
let t: SeededTenant;

beforeAll(async () => {
  handle = createDb(testDatabaseUrl());
  t = await seedTenant(handle.db, "audit");
});

afterAll(async () => {
  await handle.close();
});

async function count(): Promise<number> {
  const [row] = await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from audit_log where org_id = ${t.orgId}`);
  return row?.n ?? 0;
}

describe("audit_log is append-only", () => {
  it("authenticated users cannot update, delete or truncate", async () => {
    const before = await count();
    for (const stmt of [
      sql`update audit_log set action = 'tampered' where org_id = ${t.orgId}`,
      sql`delete from audit_log where org_id = ${t.orgId}`,
      sql`truncate audit_log`,
    ]) {
      const err = await withUser(handle.db, t.owner.claims, (tx) => tx.execute(stmt)).catch((e: unknown) => e);
      expect(dbErrorMessage(err)).toMatch(/permission denied|append-only/);
    }
    expect(await count()).toBe(before);
  });

  it("the service role cannot update, delete or truncate", async () => {
    for (const stmt of [
      sql`update audit_log set action = 'tampered' where org_id = ${t.orgId}`,
      sql`delete from audit_log where org_id = ${t.orgId}`,
      sql`truncate audit_log`,
    ]) {
      const err = await withServiceRole(handle.db, (tx) => tx.execute(stmt)).catch((e: unknown) => e);
      expect(dbErrorMessage(err)).toMatch(/permission denied|append-only/);
    }
  });

  it("even the database owner is stopped by the trigger", async () => {
    for (const stmt of [
      sql`update audit_log set action = 'tampered' where org_id = ${t.orgId}`,
      sql`delete from audit_log where org_id = ${t.orgId}`,
      sql`truncate audit_log`,
    ]) {
      const err = await handle.db.execute(stmt).catch((e: unknown) => e);
      expect(dbErrorMessage(err)).toMatch(/append-only/);
    }
  });

  it("inserts are allowed for members acting as themselves", async () => {
    const before = await count();
    await withUser(handle.db, t.owner.claims, (tx) =>
      tx.execute(sql`insert into audit_log (org_id, actor_user_id, action, target_type) values (${t.orgId}, ${t.owner.id}, 'test.action', 'organisation')`),
    );
    expect(await count()).toBe(before + 1);
  });

  it("users cannot forge entries in someone else's name", async () => {
    const err = await withUser(handle.db, t.owner.claims, (tx) =>
      tx.execute(sql`insert into audit_log (org_id, actor_user_id, action, target_type) values (${t.orgId}, ${t.accountant.id}, 'forged', 'organisation')`),
    ).catch((e: unknown) => e);
    expect(dbErrorMessage(err)).toMatch(/row-level security/);
  });

  it("viewers cannot read the audit log; owners can", async () => {
    const viewerRows = await withUser(handle.db, t.viewer.claims, (tx) => tx.execute(sql`select id from audit_log`));
    expect(viewerRows.length).toBe(0);
    const ownerRows = await withUser(handle.db, t.owner.claims, (tx) => tx.execute(sql`select id from audit_log`));
    expect(ownerRows.length).toBeGreaterThan(0);
  });
});
