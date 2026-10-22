import type { CreateEntityRequest, EntitySummary, UpdateEntityPreferencesRequest } from "@kedge/api";
import { assertCan, canAccessEntity, NotFoundError } from "@kedge/core";
import { schema, withUser } from "@kedge/db";
import { and, eq } from "drizzle-orm";
import { loadActor, orgOfEntity } from "../actor";
import { writeAudit } from "../audit";
import { requireClaims, type ServiceContext } from "../context";
import { summariseEntities } from "./shared";

/**
 * Creates the shell of an entity (one set of books). The full set-up wizard
 * (fiscal year, CoA template, bank accounts, opening balances) is Phase 1.
 */
export async function createEntity(ctx: ServiceContext, orgId: string, input: CreateEntityRequest): Promise<EntitySummary> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const actor = await loadActor(tx, claims, orgId);
    assertCan(actor, "entity.create", null, ctx.now);
    const id = crypto.randomUUID();
    const values = { id, orgId, legalName: input.legalName, tradingName: input.tradingName ?? null };
    await tx.insert(schema.entities).values(values);
    await writeAudit(tx, ctx, claims.sub, { orgId, entityId: id, action: "entity.create", targetType: "entity", targetId: id, after: values });
    const [row] = await tx.select().from(schema.entities).where(eq(schema.entities.id, id));
    if (!row) throw new NotFoundError("Business");
    const [summary] = await summariseEntities(tx, actor, [row], ctx.now);
    if (!summary) throw new NotFoundError("Business");
    return summary;
  });
}

/** Sets the caller's display mode for one entity. Presentation only; never affects permissions. */
export async function updateEntityPreferences(ctx: ServiceContext, entityId: string, input: UpdateEntityPreferencesRequest): Promise<EntitySummary> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const orgId = await orgOfEntity(tx, entityId);
    const actor = await loadActor(tx, claims, orgId);
    if (!canAccessEntity(actor, entityId, ctx.now)) throw new NotFoundError("Business");

    const [before] = await tx
      .select({ displayMode: schema.userEntityPrefs.displayMode })
      .from(schema.userEntityPrefs)
      .where(and(eq(schema.userEntityPrefs.entityId, entityId), eq(schema.userEntityPrefs.userId, claims.sub)));
    await tx
      .insert(schema.userEntityPrefs)
      .values({ orgId, entityId, userId: claims.sub, displayMode: input.displayMode })
      .onConflictDoUpdate({ target: [schema.userEntityPrefs.userId, schema.userEntityPrefs.entityId], set: { displayMode: input.displayMode } });
    await writeAudit(tx, ctx, claims.sub, {
      orgId,
      entityId,
      action: "preferences.update",
      targetType: "user_entity_prefs",
      targetId: claims.sub,
      before: before ?? null,
      after: { displayMode: input.displayMode },
    });

    const [row] = await tx.select().from(schema.entities).where(eq(schema.entities.id, entityId));
    if (!row) throw new NotFoundError("Business");
    const [summary] = await summariseEntities(tx, actor, [row], ctx.now);
    if (!summary) throw new NotFoundError("Business");
    return summary;
  });
}
