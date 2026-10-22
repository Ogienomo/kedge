import type { MeResponse, UpdateProfileRequest } from "@kedge/api";
import { NotFoundError } from "@kedge/core";
import { schema, withUser, type Tx } from "@kedge/db";
import { asc, eq } from "drizzle-orm";
import { requireClaims, type ServiceContext } from "../context";

async function me(tx: Tx, userId: string): Promise<MeResponse> {
  const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw new NotFoundError("User");

  // RLS returns exactly the orgs the caller can access: memberships and entity grants.
  const orgs = await tx
    .select({ id: schema.organisations.id, name: schema.organisations.name, kind: schema.organisations.kind })
    .from(schema.organisations)
    .orderBy(asc(schema.organisations.name));
  const memberships = await tx
    .select({ orgId: schema.memberships.orgId, role: schema.memberships.role, status: schema.memberships.status })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId));
  const roleByOrg = new Map(memberships.filter((m) => m.status === "active").map((m) => [m.orgId, m.role]));

  return {
    user: { id: user.id, email: user.email, fullName: user.fullName, mfaEnabled: user.mfaEnabled },
    organisations: orgs.map((o) => ({ ...o, role: roleByOrg.get(o.id) ?? null })),
  };
}

export async function getMe(ctx: ServiceContext): Promise<MeResponse> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, (tx) => me(tx, claims.sub));
}

/** Profile edits are personal (no org scope), so they are not written to the org audit log. */
export async function updateProfile(ctx: ServiceContext, input: UpdateProfileRequest): Promise<MeResponse> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const set: Partial<typeof schema.users.$inferInsert> = {};
    if (input.fullName !== undefined) set.fullName = input.fullName;
    if (input.phone !== undefined) set.phone = input.phone;
    if (Object.keys(set).length > 0) await tx.update(schema.users).set(set).where(eq(schema.users.id, claims.sub));
    return me(tx, claims.sub);
  });
}

/** Mirrors the auth provider's MFA state onto the profile after enrol/unenrol. */
export async function setMfaEnabled(ctx: ServiceContext, enabled: boolean): Promise<MeResponse> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    await tx.update(schema.users).set({ mfaEnabled: enabled }).where(eq(schema.users.id, claims.sub));
    return me(tx, claims.sub);
  });
}
