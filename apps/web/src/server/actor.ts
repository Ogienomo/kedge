import { NotFoundError, type Actor, type EntityGrant } from "@kedge/core";
import { schema, type AuthClaims, type Tx } from "@kedge/db";
import { and, eq } from "drizzle-orm";

/**
 * Loads the caller's grants in one org. Runs inside a `withUser` transaction,
 * so RLS limits it to the caller's own rows. Throws NotFound (never
 * PermissionDenied) when the caller has no access at all, so the API does not
 * reveal whether another tenant's org exists.
 */
export async function loadActor(tx: Tx, claims: AuthClaims, orgId: string): Promise<Actor> {
  const [membership] = await tx
    .select({ role: schema.memberships.role, status: schema.memberships.status })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, claims.sub)));

  const grants = await tx
    .select({ entityId: schema.entityAccess.entityId, role: schema.entityAccess.role, expiresAt: schema.entityAccess.expiresAt })
    .from(schema.entityAccess)
    .where(and(eq(schema.entityAccess.orgId, orgId), eq(schema.entityAccess.userId, claims.sub)));

  const orgRole = membership?.status === "active" ? membership.role : null;
  if (orgRole === null && grants.length === 0) throw new NotFoundError("Organisation");

  return {
    userId: claims.sub,
    email: claims.email,
    orgId,
    orgRole,
    entityGrants: new Map<string, EntityGrant>(grants.map((g) => [g.entityId, { role: g.role, expiresAt: g.expiresAt }])),
  };
}

/** Finds the org an entity belongs to, if the caller can see the entity. */
export async function orgOfEntity(tx: Tx, entityId: string): Promise<string> {
  const [row] = await tx.select({ orgId: schema.entities.orgId }).from(schema.entities).where(eq(schema.entities.id, entityId));
  if (!row) throw new NotFoundError("Business");
  return row.orgId;
}
