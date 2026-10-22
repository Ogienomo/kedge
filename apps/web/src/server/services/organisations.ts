import type { CreateOrganisationRequest, Member, OrganisationContext } from "@kedge/api";
import { NotFoundError, PermissionDeniedError, trialEndsAt } from "@kedge/core";
import { schema, withUser, type Tx } from "@kedge/db";
import { asc, eq } from "drizzle-orm";
import { loadActor } from "../actor";
import { writeAudit } from "../audit";
import { requireClaims, type ServiceContext } from "../context";
import { entitiesInOrg, orgPermissions, summariseEntities, toOrganisation } from "./shared";

/**
 * Sign-up step 2 (AC-0.2): creates an org of the chosen kind with the caller
 * as its Org Owner, in one transaction with its audit row.
 */
export async function createOrganisation(ctx: ServiceContext, input: CreateOrganisationRequest): Promise<OrganisationContext> {
  const claims = requireClaims(ctx);
  const orgId = crypto.randomUUID();
  return withUser(ctx.db, claims, async (tx) => {
    await tx.insert(schema.organisations).values({
      id: orgId,
      name: input.name,
      kind: input.kind,
      createdBy: claims.sub,
      trialEndsAt: trialEndsAt(ctx.now),
    });
    await tx.insert(schema.memberships).values({ orgId, userId: claims.sub, role: "org_owner" });
    await writeAudit(tx, ctx, claims.sub, {
      orgId,
      action: "organisation.create",
      targetType: "organisation",
      targetId: orgId,
      after: { name: input.name, kind: input.kind },
    });
    await writeAudit(tx, ctx, claims.sub, {
      orgId,
      action: "membership.create",
      targetType: "membership",
      targetId: claims.sub,
      after: { userId: claims.sub, role: "org_owner" },
    });
    return organisationContext(tx, ctx, orgId);
  });
}

async function organisationContext(tx: Tx, ctx: ServiceContext, orgId: string): Promise<OrganisationContext> {
  const claims = requireClaims(ctx);
  const actor = await loadActor(tx, claims, orgId);
  const [org] = await tx.select().from(schema.organisations).where(eq(schema.organisations.id, orgId));
  if (!org) throw new NotFoundError("Organisation");
  return {
    organisation: toOrganisation(org),
    role: actor.orgRole,
    orgPermissions: orgPermissions(actor, ctx.now),
    entities: await summariseEntities(tx, actor, await entitiesInOrg(tx, orgId), ctx.now),
  };
}

export async function getOrganisationContext(ctx: ServiceContext, orgId: string): Promise<OrganisationContext> {
  return withUser(ctx.db, requireClaims(ctx), (tx) => organisationContext(tx, ctx, orgId));
}

/** Org members. Visible to members of the org; client users have no org membership. */
export async function listMembers(ctx: ServiceContext, orgId: string): Promise<{ members: Member[] }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const actor = await loadActor(tx, claims, orgId);
    if (actor.orgRole === null) throw new PermissionDeniedError("org.users.manage", "Only members of this organisation can see its team");
    const rows = await tx
      .select({
        userId: schema.memberships.userId,
        role: schema.memberships.role,
        status: schema.memberships.status,
        email: schema.users.email,
        fullName: schema.users.fullName,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.orgId, orgId))
      .orderBy(asc(schema.users.email));
    return { members: rows };
  });
}
