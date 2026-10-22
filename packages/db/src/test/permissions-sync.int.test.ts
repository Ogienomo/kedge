/**
 * RLS write policies mirror SPEC §3.3 through app.permission_matrix. These
 * tests keep the SQL copy identical to PERMISSION_MATRIX in @kedge/core and
 * check that app.can()/app.entity_role() agree with core for every role.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { can, ORG_PERMISSIONS, PERMISSION_MATRIX, PERMISSIONS, type Actor, type EntityRole, type OrgRole, type Role } from "@kedge/core";
import { createDb, withUser, type DbHandle } from "../client";
import { entityAccess, memberships } from "../schema";
import { createAuthUser, createEntityAs, createOrgAs, testDatabaseUrl, type TestUser } from "../testing";

let handle: DbHandle;
let orgId: string;
let entityId: string;
let owner: TestUser;
const usersByRole = new Map<Role, TestUser>();

const ROLE_SETUP: Record<Role, { org: OrgRole | null; entity: EntityRole | null }> = {
  org_owner: { org: "org_owner", entity: null },
  org_admin: { org: "org_admin", entity: null },
  accountant: { org: "accountant", entity: "accountant" },
  bookkeeper: { org: "bookkeeper", entity: "bookkeeper" },
  client_owner: { org: null, entity: "client_owner" },
  client_staff: { org: null, entity: "client_staff" },
  viewer: { org: null, entity: "viewer" },
};

beforeAll(async () => {
  handle = createDb(testDatabaseUrl());
  owner = await createAuthUser(handle.db, "sync-owner");
  orgId = await createOrgAs(handle.db, owner, "Sync Org");
  entityId = await createEntityAs(handle.db, owner, orgId, "Sync Ltd");
  usersByRole.set("org_owner", owner);

  for (const [role, setup] of Object.entries(ROLE_SETUP) as [Role, (typeof ROLE_SETUP)[Role]][]) {
    if (role === "org_owner") continue;
    const user = await createAuthUser(handle.db, `sync-${role}`);
    usersByRole.set(role, user);
    await withUser(handle.db, owner.claims, async (tx) => {
      if (setup.org) await tx.insert(memberships).values({ orgId, userId: user.id, role: setup.org });
      if (setup.entity) await tx.insert(entityAccess).values({ orgId, entityId, userId: user.id, role: setup.entity, grantedBy: owner.id });
    });
  }
});

afterAll(async () => {
  await handle.close();
});

function coreActor(role: Role, user: TestUser): Actor {
  const setup = ROLE_SETUP[role];
  return {
    userId: user.id,
    email: user.email,
    orgId,
    orgRole: setup.org,
    entityGrants: new Map(setup.entity ? [[entityId, { role: setup.entity, expiresAt: null }]] : []),
  };
}

describe("app.permission_matrix", () => {
  it("equals PERMISSION_MATRIX in @kedge/core", async () => {
    const rows = await handle.db.execute<{ permission: string; role: string }>(sql`select permission, role from app.permission_matrix`);
    const sqlPairs = rows.map((r) => `${r.permission}:${r.role}`).sort();
    const corePairs = Object.entries(PERMISSION_MATRIX)
      .flatMap(([p, roles]) => roles.map((r) => `${p}:${r}`))
      .sort();
    expect(sqlPairs).toEqual(corePairs);
  });

  it("org permissions match ORG_PERMISSIONS", async () => {
    const rows = await handle.db.execute<{ permission: string }>(sql`select permission from app.org_permissions order by 1`);
    expect(rows.map((r) => r.permission)).toEqual([...ORG_PERMISSIONS].sort());
  });
});

describe("SQL permission checks agree with core can()", () => {
  for (const role of Object.keys(ROLE_SETUP) as Role[]) {
    it(`for ${role}`, async () => {
      const user = usersByRole.get(role);
      if (!user) throw new Error("missing user");
      const actor = coreActor(role, user);
      const results = await withUser(handle.db, user.claims, async (tx) => {
        const out: Record<string, boolean> = {};
        for (const p of PERMISSIONS) {
          const isOrg = (ORG_PERMISSIONS as readonly string[]).includes(p);
          const [row] = isOrg
            ? await tx.execute<{ ok: boolean }>(sql`select app.can_org(${p}, ${orgId}) as ok`)
            : await tx.execute<{ ok: boolean }>(sql`select app.can(${p}, ${entityId}) as ok`);
          out[p] = row?.ok ?? false;
        }
        return out;
      });
      for (const p of PERMISSIONS) {
        const isOrg = (ORG_PERMISSIONS as readonly string[]).includes(p);
        expect({ p, ok: results[p] }).toEqual({ p, ok: can(actor, p, isOrg ? null : entityId) });
      }
    });
  }

  it("unassigned firm staff hold no role on other entities", async () => {
    const other = await createEntityAs(handle.db, owner, orgId, `Other ${randomUUID().slice(0, 4)}`);
    const accountant = usersByRole.get("accountant");
    if (!accountant) throw new Error("missing user");
    const [row] = await withUser(handle.db, accountant.claims, (tx) => tx.execute<{ role: string | null }>(sql`select app.entity_role(${other}) as role`));
    expect(row?.role).toBeNull();
  });

  it("expired grants give no access", async () => {
    const viewer = await createAuthUser(handle.db, "expired-viewer");
    await withUser(handle.db, owner.claims, (tx) =>
      tx.insert(entityAccess).values({ orgId, entityId, userId: viewer.id, role: "viewer", expiresAt: new Date(Date.now() - 1000), grantedBy: owner.id }),
    );
    const rows = await withUser(handle.db, viewer.claims, (tx) => tx.execute(sql`select id from entities`));
    expect(rows.length).toBe(0);
  });

  it("suspended staff lose access to assigned entities", async () => {
    const bk = await createAuthUser(handle.db, "suspended-bk");
    await withUser(handle.db, owner.claims, async (tx) => {
      await tx.insert(memberships).values({ orgId, userId: bk.id, role: "bookkeeper", status: "suspended" });
      await tx.insert(entityAccess).values({ orgId, entityId, userId: bk.id, role: "bookkeeper", grantedBy: owner.id });
    });
    const rows = await withUser(handle.db, bk.claims, (tx) => tx.execute(sql`select id from entities`));
    expect(rows.length).toBe(0);
  });
});
