/** Write-policy backstops: role escalation, billing fields, invitation acceptance. */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withUser, type DbHandle } from "../client";
import { entityAccess, invitations, memberships, organisations } from "../schema";
import { createAuthUser, dbErrorMessage, seedTenant, testDatabaseUrl, type SeededTenant, type TestUser } from "../testing";

let handle: DbHandle;
let t: SeededTenant;

beforeAll(async () => {
  handle = createDb(testDatabaseUrl());
  t = await seedTenant(handle.db, "policy");
});

afterAll(async () => {
  await handle.close();
});

async function fails(user: TestUser, fn: Parameters<typeof withUser>[2]): Promise<string> {
  const err = await withUser(handle.db, user.claims, fn).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the statement to be rejected").not.toBeNull();
  return dbErrorMessage(err);
}

describe("role escalation", () => {
  it("admins cannot create a second owner", async () => {
    const admin = await createAuthUser(handle.db, "admin");
    await withUser(handle.db, t.owner.claims, (tx) => tx.insert(memberships).values({ orgId: t.orgId, userId: admin.id, role: "org_admin" }));
    const other = await createAuthUser(handle.db, "other");
    expect(await fails(admin, (tx) => tx.insert(memberships).values({ orgId: t.orgId, userId: other.id, role: "org_owner" }))).toMatch(/row-level security/);
  });

  it("admins cannot demote or remove the owner", async () => {
    const admin = await createAuthUser(handle.db, "admin2");
    await withUser(handle.db, t.owner.claims, (tx) => tx.insert(memberships).values({ orgId: t.orgId, userId: admin.id, role: "org_admin" }));
    const res = await withUser(handle.db, admin.claims, (tx) =>
      tx.update(memberships).set({ role: "bookkeeper" }).where(eq(memberships.userId, t.owner.id)).returning({ id: memberships.id }),
    );
    expect(res).toEqual([]);
    const del = await withUser(handle.db, admin.claims, (tx) => tx.delete(memberships).where(eq(memberships.userId, t.owner.id)).returning({ id: memberships.id }));
    expect(del).toEqual([]);
  });

  it("a second owner is impossible even for the database owner", async () => {
    const other = await createAuthUser(handle.db, "owner2");
    const err = await handle.db.insert(memberships).values({ orgId: t.orgId, userId: other.id, role: "org_owner" }).catch((e: unknown) => e);
    expect(dbErrorMessage(err)).toMatch(/memberships_one_owner_per_org/);
  });

  it("accountants can grant client roles but not staff roles on their entity", async () => {
    const client = await createAuthUser(handle.db, "client");
    await withUser(handle.db, t.accountant.claims, (tx) =>
      tx.insert(entityAccess).values({ orgId: t.orgId, entityId: t.entityId, userId: client.id, role: "client_staff", grantedBy: t.accountant.id }),
    );
    const staff = await createAuthUser(handle.db, "staff");
    expect(
      await fails(t.accountant, (tx) =>
        tx.insert(entityAccess).values({ orgId: t.orgId, entityId: t.entityId, userId: staff.id, role: "accountant", grantedBy: t.accountant.id }),
      ),
    ).toMatch(/row-level security/);
  });

  it("viewers cannot grant anything", async () => {
    const someone = await createAuthUser(handle.db, "someone");
    expect(
      await fails(t.viewer, (tx) =>
        tx.insert(entityAccess).values({ orgId: t.orgId, entityId: t.entityId, userId: someone.id, role: "viewer", grantedBy: t.viewer.id }),
      ),
    ).toMatch(/row-level security/);
  });
});

describe("billing fields", () => {
  it("cannot be changed by users, not even the owner", async () => {
    expect(await fails(t.owner, (tx) => tx.update(organisations).set({ billingStatus: "active" }).where(eq(organisations.id, t.orgId)))).toMatch(/billing fields/);
  });

  it("new organisations must start on a trial", async () => {
    const u = await createAuthUser(handle.db, "trialist");
    expect(
      await fails(u, (tx) =>
        tx.insert(organisations).values({ id: randomUUID(), name: "Free Ride", kind: "business", createdBy: u.id, billingStatus: "active", trialEndsAt: new Date() }),
      ),
    ).toMatch(/trial/);
  });

  it("other org settings can be edited by admins", async () => {
    const res = await withUser(handle.db, t.owner.claims, (tx) =>
      tx.update(organisations).set({ brandColour: "#0F766E" }).where(eq(organisations.id, t.orgId)).returning({ id: organisations.id }),
    );
    expect(res).toHaveLength(1);
  });
});

describe("invitation acceptance", () => {
  async function invite(email: string, role: "client_owner" | "accountant", entityId: string | null): Promise<string> {
    const id = randomUUID();
    await withUser(handle.db, t.owner.claims, (tx) =>
      tx.insert(invitations).values({
        id,
        orgId: t.orgId,
        entityId,
        email,
        role,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedBy: t.owner.id,
      }),
    );
    return id;
  }

  it("the invitee can take exactly the invited grant and mark it accepted", async () => {
    const invitee = await createAuthUser(handle.db, "invitee");
    const id = await invite(invitee.email, "client_owner", t.entityId);

    await withUser(handle.db, invitee.claims, async (tx) => {
      await tx.insert(entityAccess).values({ orgId: t.orgId, entityId: t.entityId, userId: invitee.id, role: "client_owner" });
      await tx.update(invitations).set({ acceptedAt: new Date(), acceptedBy: invitee.id }).where(eq(invitations.id, id));
    });

    const rows = await withUser(handle.db, invitee.claims, (tx) => tx.execute(sql`select id from entities`));
    expect(rows).toHaveLength(1);
  });

  it("the invitee cannot take a higher role than invited", async () => {
    const invitee = await createAuthUser(handle.db, "greedy");
    await invite(invitee.email, "client_owner", t.entityId);
    expect(
      await fails(invitee, (tx) => tx.insert(memberships).values({ orgId: t.orgId, userId: invitee.id, role: "org_admin" })),
    ).toMatch(/row-level security/);
  });

  it("another user cannot use someone else's invitation", async () => {
    const invitee = await createAuthUser(handle.db, "real");
    const thief = await createAuthUser(handle.db, "thief");
    await invite(invitee.email, "client_owner", t.entityId);
    expect(
      await fails(thief, (tx) => tx.insert(entityAccess).values({ orgId: t.orgId, entityId: t.entityId, userId: thief.id, role: "client_owner" })),
    ).toMatch(/row-level security/);
  });

  it("an accepted invitation cannot be reused", async () => {
    const invitee = await createAuthUser(handle.db, "twice");
    const id = await invite(invitee.email, "accountant", null);
    await withUser(handle.db, invitee.claims, async (tx) => {
      await tx.insert(memberships).values({ orgId: t.orgId, userId: invitee.id, role: "accountant" });
      await tx.update(invitations).set({ acceptedAt: new Date(), acceptedBy: invitee.id }).where(eq(invitations.id, id));
    });
    expect(
      await fails(invitee, (tx) => tx.update(invitations).set({ acceptedAt: new Date(), acceptedBy: invitee.id }).where(eq(invitations.id, id))),
    ).toMatch(/no longer pending/);
  });

  it("the invitee cannot extend or rewrite the invitation", async () => {
    const invitee = await createAuthUser(handle.db, "rewriter");
    const id = await invite(invitee.email, "client_owner", t.entityId);
    expect(
      await fails(invitee, (tx) => tx.update(invitations).set({ expiresAt: new Date(Date.now() + 1e10) }).where(eq(invitations.id, id))),
    ).toMatch(/cannot be edited/);
  });

  it("expired invitations grant nothing", async () => {
    const invitee = await createAuthUser(handle.db, "late");
    await handle.db.insert(invitations).values({
      orgId: t.orgId,
      entityId: t.entityId,
      email: invitee.email,
      role: "client_owner",
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() - 1000),
      invitedBy: t.owner.id,
    });
    expect(
      await fails(invitee, (tx) => tx.insert(entityAccess).values({ orgId: t.orgId, entityId: t.entityId, userId: invitee.id, role: "client_owner" })),
    ).toMatch(/row-level security/);
  });
});
