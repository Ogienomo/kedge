import type { AcceptInvitationResponse, CreateInvitationRequest, Invitation, InvitationOptions, InvitationPreview } from "@kedge/api";
import { createInvitationRequestSchema } from "@kedge/api";
import {
  assertCanAccept,
  assertCanInvite,
  ConflictError,
  defaultDisplayMode,
  generateInvitationToken,
  grantsForInvitation,
  hashInvitationToken,
  invitableRoles,
  invitationExpiresAt,
  invitationStatus,
  NotFoundError,
  roleLabel,
} from "@kedge/core";
import { APP_NAME } from "@kedge/config";
import { schema, withServiceRole, withUser, type Tx } from "@kedge/db";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { loadActor } from "../actor";
import { writeAudit } from "../audit";
import { requireClaims, type ServiceContext } from "../context";
import { escapeHtml } from "../email";

type InvitationRow = typeof schema.invitations.$inferSelect;

function toInvitation(row: InvitationRow, entityName: string | null, now: Date): Invitation {
  return {
    id: row.id,
    orgId: row.orgId,
    entityId: row.entityId,
    entityName,
    email: row.email,
    role: row.role,
    status: invitationStatus(row, now),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function entityName(tx: Tx, entityId: string | null): Promise<string | null> {
  if (entityId === null) return null;
  const [row] = await tx.select({ legalName: schema.entities.legalName }).from(schema.entities).where(eq(schema.entities.id, entityId));
  return row?.legalName ?? null;
}

/**
 * AC-0.3: invites one person into the org or one entity with one role. The
 * token is emailed and only its hash is stored. Expires after 7 days.
 */
export async function createInvitation(ctx: ServiceContext, orgId: string, raw: CreateInvitationRequest): Promise<Invitation> {
  const claims = requireClaims(ctx);
  const input = createInvitationRequestSchema.parse(raw);
  const token = generateInvitationToken();
  const tokenHash = await hashInvitationToken(token);

  const { invitation, orgName } = await withUser(ctx.db, claims, async (tx) => {
    const actor = await loadActor(tx, claims, orgId);
    if (input.entityId !== null) {
      const [entity] = await tx
        .select({ id: schema.entities.id })
        .from(schema.entities)
        .where(and(eq(schema.entities.id, input.entityId), eq(schema.entities.orgId, orgId)));
      if (!entity) throw new NotFoundError("Business");
    }
    assertCanInvite(actor, input.role, input.entityId, ctx.now);

    const pending = await tx
      .select()
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.orgId, orgId),
          eq(schema.invitations.email, input.email),
          input.entityId === null ? isNull(schema.invitations.entityId) : eq(schema.invitations.entityId, input.entityId),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
        ),
      );
    if (pending.some((p) => invitationStatus(p, ctx.now) === "pending")) {
      throw new ConflictError(`${input.email} already has a pending invitation here. Revoke it first to send a new one.`);
    }

    const id = crypto.randomUUID();
    await tx.insert(schema.invitations).values({
      id,
      orgId,
      entityId: input.entityId,
      email: input.email,
      role: input.role,
      tokenHash,
      expiresAt: invitationExpiresAt(ctx.now),
      invitedBy: claims.sub,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    await writeAudit(tx, ctx, claims.sub, {
      orgId,
      entityId: input.entityId,
      action: "invitation.create",
      targetType: "invitation",
      targetId: id,
      after: { email: input.email, role: input.role, entityId: input.entityId },
    });
    const [row] = await tx.select().from(schema.invitations).where(eq(schema.invitations.id, id));
    if (!row) throw new NotFoundError("Invitation");
    const [org] = await tx.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, orgId));
    return { invitation: toInvitation(row, await entityName(tx, row.entityId), ctx.now), orgName: org?.name ?? "" };
  });

  // Sent after commit: a failed email never leaves a half-written invitation,
  // and the inviter can revoke and resend.
  const link = `${ctx.appUrl}/invite/${token}`;
  const where = invitation.entityName ?? orgName;
  const sent = await ctx.email
    .send({
    kind: "invitation",
    to: invitation.email,
    subject: `You're invited to ${where} on ${APP_NAME}`,
    text: `You've been invited to join ${where} on ${APP_NAME} as ${roleLabel(invitation.role)}.\n\nAccept the invitation: ${link}\n\nThis link expires in 7 days.`,
    html: `<p>You've been invited to join <strong>${escapeHtml(where)}</strong> on ${APP_NAME} as ${escapeHtml(roleLabel(invitation.role))}.</p><p><a href="${escapeHtml(link)}">Accept the invitation</a></p><p>This link expires in 7 days.</p>`,
    })
    .then(
      () => true,
      () => {
        console.error("[email] invitation email failed", { invitationId: invitation.id });
        return false;
      },
    );

  return { ...invitation, emailSent: sent };
}

export async function invitationOptions(ctx: ServiceContext, orgId: string): Promise<InvitationOptions> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const actor = await loadActor(tx, claims, orgId);
    const entities = await tx
      .select({ id: schema.entities.id, name: schema.entities.legalName })
      .from(schema.entities)
      .where(and(eq(schema.entities.orgId, orgId), eq(schema.entities.status, "active")))
      .orderBy(asc(schema.entities.legalName));
    return {
      organisation: [...invitableRoles(actor, null, ctx.now)],
      entities: entities.map((e) => ({ ...e, roles: [...invitableRoles(actor, e.id, ctx.now)] })).filter((e) => e.roles.length > 0),
    };
  });
}

/** Invitations the caller manages in this org (RLS limits rows to their scope). */
export async function listInvitations(ctx: ServiceContext, orgId: string): Promise<{ invitations: Invitation[] }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    await loadActor(tx, claims, orgId);
    const rows = await tx
      .select({ inv: schema.invitations, entityName: schema.entities.legalName })
      .from(schema.invitations)
      .leftJoin(schema.entities, eq(schema.entities.id, schema.invitations.entityId))
      .where(eq(schema.invitations.orgId, orgId))
      .orderBy(desc(schema.invitations.createdAt));
    return { invitations: rows.map((r) => toInvitation(r.inv, r.entityName, ctx.now)) };
  });
}

export async function revokeInvitation(ctx: ServiceContext, invitationId: string): Promise<Invitation> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const [row] = await tx.select().from(schema.invitations).where(eq(schema.invitations.id, invitationId));
    if (!row) throw new NotFoundError("Invitation");
    const actor = await loadActor(tx, claims, row.orgId);
    assertCanInvite(actor, row.role, row.entityId, ctx.now);
    if (invitationStatus(row, ctx.now) !== "pending") throw new ConflictError("Only pending invitations can be revoked");

    await tx.update(schema.invitations).set({ revokedAt: ctx.now, revokedBy: claims.sub }).where(eq(schema.invitations.id, invitationId));
    await writeAudit(tx, ctx, claims.sub, {
      orgId: row.orgId,
      entityId: row.entityId,
      action: "invitation.revoke",
      targetType: "invitation",
      targetId: row.id,
      before: { status: "pending" },
      after: { status: "revoked" },
    });
    const [updated] = await tx.select().from(schema.invitations).where(eq(schema.invitations.id, invitationId));
    if (!updated) throw new NotFoundError("Invitation");
    return toInvitation(updated, await entityName(tx, updated.entityId), ctx.now);
  });
}

/** Looks an invitation up by token with the service role (the visitor may not be signed in). */
async function findByToken(ctx: ServiceContext, token: string) {
  const tokenHash = await hashInvitationToken(token);
  return withServiceRole(ctx.db, async (tx) => {
    const [row] = await tx
      .select({ inv: schema.invitations, orgName: schema.organisations.name, entityName: schema.entities.legalName })
      .from(schema.invitations)
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.invitations.orgId))
      .leftJoin(schema.entities, eq(schema.entities.id, schema.invitations.entityId))
      .where(eq(schema.invitations.tokenHash, tokenHash));
    return row ?? null;
  });
}

/** Public: what the invitation is for, shown on /invite/[token] before sign-in. */
export async function previewInvitation(ctx: ServiceContext, token: string): Promise<InvitationPreview> {
  const found = await findByToken(ctx, token);
  if (!found) throw new NotFoundError("Invitation");
  return {
    organisationName: found.orgName,
    entityName: found.entityName,
    role: found.inv.role,
    email: found.inv.email,
    status: invitationStatus(found.inv, ctx.now),
    expiresAt: found.inv.expiresAt.toISOString(),
  };
}

/**
 * Accepts an invitation for the signed-in user. The grants are written under
 * the user's own RLS context, where policies only allow exactly what a
 * pending invitation for their email permits.
 */
export async function acceptInvitation(ctx: ServiceContext, token: string): Promise<AcceptInvitationResponse> {
  const claims = requireClaims(ctx);
  const found = await findByToken(ctx, token);
  if (!found) throw new NotFoundError("Invitation");
  const inv = found.inv;
  assertCanAccept(inv, claims.email, ctx.now);
  const grants = grantsForInvitation(inv.role, inv.entityId);

  return withUser(ctx.db, claims, async (tx) => {
    if (grants.membershipRole) {
      const [existing] = await tx
        .select({ role: schema.memberships.role })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.orgId, inv.orgId), eq(schema.memberships.userId, claims.sub)));
      if (!existing) {
        await tx.insert(schema.memberships).values({ orgId: inv.orgId, userId: claims.sub, role: grants.membershipRole });
        await writeAudit(tx, ctx, claims.sub, {
          orgId: inv.orgId,
          action: "membership.create",
          targetType: "membership",
          targetId: claims.sub,
          after: { userId: claims.sub, role: grants.membershipRole, viaInvitation: inv.id },
        });
      } else if (inv.entityId === null) {
        throw new ConflictError("You are already a member of this organisation");
      }
    }

    if (grants.entityGrantRole && inv.entityId) {
      const [existing] = await tx
        .select({ id: schema.entityAccess.id })
        .from(schema.entityAccess)
        .where(and(eq(schema.entityAccess.entityId, inv.entityId), eq(schema.entityAccess.userId, claims.sub)));
      if (existing) throw new ConflictError("You already have access to this business");
      await tx.insert(schema.entityAccess).values({
        orgId: inv.orgId,
        entityId: inv.entityId,
        userId: claims.sub,
        role: grants.entityGrantRole,
        grantedBy: inv.invitedBy,
      });
      await tx
        .insert(schema.userEntityPrefs)
        .values({ orgId: inv.orgId, entityId: inv.entityId, userId: claims.sub, displayMode: defaultDisplayMode(grants.entityGrantRole) })
        .onConflictDoNothing();
      await writeAudit(tx, ctx, claims.sub, {
        orgId: inv.orgId,
        entityId: inv.entityId,
        action: "entity_access.create",
        targetType: "entity_access",
        targetId: claims.sub,
        after: { userId: claims.sub, role: grants.entityGrantRole, viaInvitation: inv.id },
      });
    }

    await tx.update(schema.invitations).set({ acceptedAt: ctx.now, acceptedBy: claims.sub }).where(eq(schema.invitations.id, inv.id));
    await writeAudit(tx, ctx, claims.sub, {
      orgId: inv.orgId,
      entityId: inv.entityId,
      action: "invitation.accept",
      targetType: "invitation",
      targetId: inv.id,
      before: { status: "pending" },
      after: { status: "accepted" },
    });
    return { orgId: inv.orgId, entityId: inv.entityId };
  });
}
