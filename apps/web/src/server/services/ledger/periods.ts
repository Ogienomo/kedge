import type { FiscalYear } from "@kedge/api";
import { lockPeriodRequestSchema, unlockPeriodRequestSchema } from "@kedge/api";
import { assertCan, assertCanLock, assertCanUnlock, ConflictError, fiscalYearStarting, NotFoundError } from "@kedge/core";
import { schema, withUser, type Tx } from "@kedge/db";
import { asc, desc, eq } from "drizzle-orm";
import { writeAudit } from "../../audit";
import { requireClaims, type ServiceContext } from "../../context";
import { createFiscalYear } from "./setup";
import { entityScope } from "./scope";

async function fiscalYears(tx: Tx, entityId: string): Promise<FiscalYear[]> {
  const years = await tx.select().from(schema.fiscalYears).where(eq(schema.fiscalYears.entityId, entityId)).orderBy(asc(schema.fiscalYears.startDate));
  const periods = await tx.select().from(schema.periods).where(eq(schema.periods.entityId, entityId)).orderBy(asc(schema.periods.startDate));
  return years.map((y) => ({
    id: y.id,
    startDate: y.startDate,
    endDate: y.endDate,
    status: y.status,
    periods: periods
      .filter((p) => p.fiscalYearId === y.id)
      .map((p) => ({
        id: p.id,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        lockedAt: p.lockedAt?.toISOString() ?? null,
        lockReason: p.lockReason,
        unlockReason: p.unlockReason,
      })),
  }));
}

export async function listPeriods(ctx: ServiceContext, entityId: string): Promise<{ fiscalYears: FiscalYear[] }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    await entityScope(tx, claims, entityId, ctx.now);
    return { fiscalYears: await fiscalYears(tx, entityId) };
  });
}

async function periodScope(tx: Tx, ctx: ServiceContext, periodId: string) {
  const claims = requireClaims(ctx);
  const [period] = await tx.select().from(schema.periods).where(eq(schema.periods.id, periodId));
  if (!period) throw new NotFoundError("Period");
  return { period, scope: await entityScope(tx, claims, period.entityId, ctx.now) };
}

/** Locks a period: nothing can post into it until it is unlocked (rule 5). */
export async function lockPeriod(ctx: ServiceContext, periodId: string, raw: unknown): Promise<{ fiscalYears: FiscalYear[] }> {
  const claims = requireClaims(ctx);
  const input = lockPeriodRequestSchema.parse(raw ?? {});
  return withUser(ctx.db, claims, async (tx) => {
    const { period, scope } = await periodScope(tx, ctx, periodId);
    assertCan(scope.actor, "period.lock", scope.entityId, ctx.now);
    assertCanLock(period);
    await tx
      .update(schema.periods)
      .set({ status: "locked", lockedAt: ctx.now, lockedBy: claims.sub, lockReason: input.reason ?? null })
      .where(eq(schema.periods.id, periodId));
    await writeAudit(tx, ctx, claims.sub, {
      orgId: scope.orgId,
      entityId: scope.entityId,
      action: "period.lock",
      targetType: "period",
      targetId: periodId,
      before: { status: period.status },
      after: { status: "locked", startDate: period.startDate, endDate: period.endDate },
      reason: input.reason ?? null,
    });
    return { fiscalYears: await fiscalYears(tx, scope.entityId) };
  });
}

/** Unlocks a period. Requires period.unlock and a written reason, and is audited (AC-1.4). */
export async function unlockPeriod(ctx: ServiceContext, periodId: string, raw: unknown): Promise<{ fiscalYears: FiscalYear[] }> {
  const claims = requireClaims(ctx);
  const input = unlockPeriodRequestSchema.parse(raw ?? {});
  return withUser(ctx.db, claims, async (tx) => {
    const { period, scope } = await periodScope(tx, ctx, periodId);
    assertCan(scope.actor, "period.unlock", scope.entityId, ctx.now);
    assertCanUnlock(period, input.reason);
    await tx.update(schema.periods).set({ status: "open", unlockReason: input.reason }).where(eq(schema.periods.id, periodId));
    await writeAudit(tx, ctx, claims.sub, {
      orgId: scope.orgId,
      entityId: scope.entityId,
      action: "period.unlock",
      targetType: "period",
      targetId: periodId,
      before: { status: "locked" },
      after: { status: "open", startDate: period.startDate, endDate: period.endDate },
      reason: input.reason,
    });
    return { fiscalYears: await fiscalYears(tx, scope.entityId) };
  });
}

/** Adds the fiscal year after the latest one, with twelve open periods. */
export async function addNextFiscalYear(ctx: ServiceContext, entityId: string): Promise<{ fiscalYears: FiscalYear[] }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    assertCan(scope.actor, "entity.settings.edit", entityId, ctx.now);
    const [latest] = await tx.select().from(schema.fiscalYears).where(eq(schema.fiscalYears.entityId, entityId)).orderBy(desc(schema.fiscalYears.startDate)).limit(1);
    if (!latest) throw new ConflictError("Set up the books first");
    const next = fiscalYearStarting(Number(latest.startDate.slice(0, 4)) + 1, scope.entity.fiscalYearStartMonth);
    const id = await createFiscalYear(tx, scope, next);
    await writeAudit(tx, ctx, claims.sub, { orgId: scope.orgId, entityId, action: "fiscal_year.create", targetType: "fiscal_year", targetId: id, after: next });
    return { fiscalYears: await fiscalYears(tx, entityId) };
  });
}
