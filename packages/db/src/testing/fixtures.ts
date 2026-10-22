import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { trialEndsAt } from "@kedge/core";
import { withUser, type AuthClaims, type Database } from "../client";
import { auditLog, entities, entityAccess, invitations, memberships, organisations, userEntityPrefs } from "../schema";

export interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly claims: AuthClaims;
}

/** Inserts a user into the (shimmed) auth.users table; a trigger mirrors it into public.users. */
export async function createAuthUser(db: Database, label = "user"): Promise<TestUser> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@example.test`;
  await db.execute(
    sql`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values (${id}, ${email}, ${JSON.stringify({ full_name: label })}::jsonb, now())`,
  );
  return { id, email, claims: { sub: id, email } };
}

/** Creates an org through RLS exactly as sign-up does: org, owner membership, audit row. */
export async function createOrgAs(db: Database, owner: TestUser, name: string, kind: "firm" | "business" = "firm"): Promise<string> {
  const orgId = randomUUID();
  await withUser(db, owner.claims, async (tx) => {
    await tx.insert(organisations).values({ id: orgId, name, kind, createdBy: owner.id, trialEndsAt: trialEndsAt(new Date()) });
    await tx.insert(memberships).values({ orgId, userId: owner.id, role: "org_owner" });
    await tx.insert(auditLog).values({ orgId, actorUserId: owner.id, action: "organisation.create", targetType: "organisation", targetId: orgId });
  });
  return orgId;
}

export async function createEntityAs(db: Database, user: TestUser, orgId: string, legalName: string): Promise<string> {
  const entityId = randomUUID();
  await withUser(db, user.claims, async (tx) => {
    await tx.insert(entities).values({ id: entityId, orgId, legalName });
    await tx.insert(auditLog).values({ orgId, entityId, actorUserId: user.id, action: "entity.create", targetType: "entity", targetId: entityId });
  });
  return entityId;
}

export interface SeededTenant {
  readonly orgId: string;
  readonly entityId: string;
  readonly owner: TestUser;
  readonly accountant: TestUser;
  readonly viewer: TestUser;
  readonly invitationId: string;
}

/**
 * Creates one org with a row in every tenant table, all written through RLS
 * by the org's own users.
 */
export async function seedTenant(db: Database, label: string): Promise<SeededTenant> {
  const owner = await createAuthUser(db, `${label}-owner`);
  const accountant = await createAuthUser(db, `${label}-accountant`);
  const viewer = await createAuthUser(db, `${label}-viewer`);
  const orgId = await createOrgAs(db, owner, `${label} Org`);
  const entityId = await createEntityAs(db, owner, orgId, `${label} Ltd`);
  const invitationId = randomUUID();

  await withUser(db, owner.claims, async (tx) => {
    await tx.insert(memberships).values({ orgId, userId: accountant.id, role: "accountant" });
    await tx.insert(entityAccess).values([
      { orgId, entityId, userId: accountant.id, role: "accountant", grantedBy: owner.id },
      { orgId, entityId, userId: viewer.id, role: "viewer", grantedBy: owner.id },
    ]);
    await tx.insert(userEntityPrefs).values({ orgId, entityId, userId: owner.id, displayMode: "accountant" });
    await tx.insert(invitations).values({
      id: invitationId,
      orgId,
      entityId,
      email: `${label}-invitee@example.test`.toLowerCase(),
      role: "client_owner",
      tokenHash: randomUUID().replace(/-/g, ""),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      invitedBy: owner.id,
    });
  });

  return { orgId, entityId, owner, accountant, viewer, invitationId };
}
