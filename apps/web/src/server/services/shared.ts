import type { EntitySummary, Organisation } from "@kedge/api";
import { can, defaultDisplayMode, effectiveEntityRole, isOrgPermission, PERMISSIONS, type Actor } from "@kedge/core";
import { schema, type Tx } from "@kedge/db";
import { and, asc, eq, inArray } from "drizzle-orm";

type OrgRow = typeof schema.organisations.$inferSelect;
type EntityRow = typeof schema.entities.$inferSelect;

export function toOrganisation(row: OrgRow): Organisation {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    billingStatus: row.billingStatus,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    brandColour: row.brandColour,
  };
}

export function entityPermissions(actor: Actor, entityId: string, now: Date) {
  return PERMISSIONS.filter((p) => !isOrgPermission(p) && can(actor, p, entityId, now));
}

export function orgPermissions(actor: Actor, now: Date) {
  return PERMISSIONS.filter((p) => isOrgPermission(p) && can(actor, p, null, now));
}

/** Summaries of the given entities from the actor's point of view; entities they cannot access are dropped. */
export async function summariseEntities(tx: Tx, actor: Actor, rows: readonly EntityRow[], now: Date): Promise<EntitySummary[]> {
  if (rows.length === 0) return [];
  const prefs = await tx
    .select({ entityId: schema.userEntityPrefs.entityId, displayMode: schema.userEntityPrefs.displayMode })
    .from(schema.userEntityPrefs)
    .where(
      and(
        eq(schema.userEntityPrefs.userId, actor.userId),
        inArray(
          schema.userEntityPrefs.entityId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const modeByEntity = new Map(prefs.map((p) => [p.entityId, p.displayMode]));

  const out: EntitySummary[] = [];
  for (const row of rows) {
    const role = effectiveEntityRole(actor, row.id, now);
    if (role === null) continue;
    out.push({
      id: row.id,
      orgId: row.orgId,
      legalName: row.legalName,
      tradingName: row.tradingName,
      status: row.status,
      role,
      displayMode: modeByEntity.get(row.id) ?? defaultDisplayMode(role),
      permissions: entityPermissions(actor, row.id, now),
    });
  }
  return out;
}

export async function entitiesInOrg(tx: Tx, orgId: string): Promise<EntityRow[]> {
  return tx.select().from(schema.entities).where(eq(schema.entities.orgId, orgId)).orderBy(asc(schema.entities.legalName));
}
