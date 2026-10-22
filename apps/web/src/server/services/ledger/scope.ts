import { canAccessEntity, dateInTimezone, NotFoundError, type Actor, type PeriodInfo, type PostedLine, type ReportAccount } from "@kedge/core";
import { schema, type AuthClaims, type Tx } from "@kedge/db";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { loadActor } from "../../actor";

export type EntityRow = typeof schema.entities.$inferSelect;

/** Tenant context for one entity: the explicit scope every ledger operation takes. */
export interface EntityScope {
  readonly orgId: string;
  readonly entityId: string;
  readonly entity: EntityRow;
  readonly actor: Actor;
  /** Today in the entity's timezone (rule 11). */
  readonly today: string;
}

export async function entityScope(tx: Tx, claims: AuthClaims, entityId: string, now: Date): Promise<EntityScope> {
  const [entity] = await tx.select().from(schema.entities).where(eq(schema.entities.id, entityId));
  if (!entity) throw new NotFoundError("Business");
  const actor = await loadActor(tx, claims, entity.orgId);
  if (!canAccessEntity(actor, entityId, now)) throw new NotFoundError("Business");
  return { orgId: entity.orgId, entityId, entity, actor, today: dateInTimezone(now, entity.timezone) };
}

type AccountRow = typeof schema.accounts.$inferSelect;

export function toReportAccount(a: AccountRow): ReportAccount {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    subtype: a.subtype as ReportAccount["subtype"],
    isLeaf: a.isLeaf,
    isActive: a.isActive,
    systemKey: a.systemKey,
    parentId: a.parentId,
    cashFlowCategory: a.cashFlowCategory,
  };
}

export async function loadAccounts(tx: Tx, entityId: string): Promise<ReportAccount[]> {
  const rows = await tx.select().from(schema.accounts).where(eq(schema.accounts.entityId, entityId)).orderBy(asc(schema.accounts.code));
  return rows.map(toReportAccount);
}

export async function accountMap(tx: Tx, entityId: string): Promise<Map<string, ReportAccount>> {
  return new Map((await loadAccounts(tx, entityId)).map((a) => [a.id, a]));
}

export async function systemAccountId(tx: Tx, entityId: string, key: NonNullable<AccountRow["systemKey"]>): Promise<string> {
  const [row] = await tx
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.entityId, entityId), eq(schema.accounts.systemKey, key)));
  if (!row) throw new NotFoundError(`System account ${key}`);
  return row.id;
}

export async function loadPeriods(tx: Tx, entityId: string): Promise<PeriodInfo[]> {
  return tx
    .select({ id: schema.periods.id, startDate: schema.periods.startDate, endDate: schema.periods.endDate, status: schema.periods.status })
    .from(schema.periods)
    .where(eq(schema.periods.entityId, entityId))
    .orderBy(asc(schema.periods.startDate));
}

export async function periodFor(tx: Tx, entityId: string, date: string): Promise<PeriodInfo | null> {
  const [row] = await tx
    .select({ id: schema.periods.id, startDate: schema.periods.startDate, endDate: schema.periods.endDate, status: schema.periods.status })
    .from(schema.periods)
    .where(and(eq(schema.periods.entityId, entityId), lte(schema.periods.startDate, date), sql`${schema.periods.endDate} >= ${date}`));
  return row ?? null;
}

/**
 * Posted journal lines of an entity (rule 6: reports read only these).
 * Phase 1 loads them into memory; SQL aggregation comes with the
 * performance work for 250k-line entities (SPEC §12).
 */
export async function loadPostedLines(tx: Tx, entityId: string, upTo?: string): Promise<PostedLine[]> {
  const rows = await tx
    .select({
      entryId: schema.journalEntries.id,
      entryNumber: schema.journalEntries.number,
      entryDate: schema.journalEntries.entryDate,
      memo: schema.journalEntries.memo,
      sourceType: schema.journalEntries.sourceType,
      lineNo: schema.journalLines.lineNo,
      accountId: schema.journalLines.accountId,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
      description: schema.journalLines.description,
      contactId: schema.journalLines.contactId,
    })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalEntries.id, schema.journalLines.entryId))
    .where(
      and(
        eq(schema.journalLines.entityId, entityId),
        eq(schema.journalEntries.status, "posted"),
        upTo ? lte(schema.journalEntries.entryDate, upTo) : undefined,
      ),
    );
  return rows.map((r) => ({ ...r, entryNumber: r.entryNumber ?? "" }));
}

export async function fiscalYearStartFor(tx: Tx, entityId: string, date: string, startMonth: number): Promise<string> {
  const [fy] = await tx
    .select({ startDate: schema.fiscalYears.startDate })
    .from(schema.fiscalYears)
    .where(and(eq(schema.fiscalYears.entityId, entityId), lte(schema.fiscalYears.startDate, date), sql`${schema.fiscalYears.endDate} >= ${date}`));
  if (fy) return fy.startDate;
  // Outside any configured year: fall back to the calendar rule.
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return `${m >= startMonth ? y : y - 1}-${String(startMonth).padStart(2, "0")}-01`;
}
