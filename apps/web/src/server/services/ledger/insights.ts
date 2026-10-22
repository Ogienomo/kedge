import type { AuditEntry, Dashboard, PracticeClient } from "@kedge/api";
import { addMonths, assertCan, can, categoryBreakdown, daysInMonth, formatIsoDate, NotFoundError, PermissionDeniedError, trialBalance } from "@kedge/core";
import { schema, withUser, type Tx } from "@kedge/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { loadActor } from "../../actor";
import { requireClaims, type ServiceContext } from "../../context";
import { draftCount } from "./journals";
import { entityScope, loadAccounts, loadPostedLines } from "./scope";

async function suspenseBalance(tx: Tx, entityId: string): Promise<bigint> {
  const [row] = await tx.execute<{ bal: string }>(sql`
    select (coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0))::text as bal
      from journal_lines l
      join journal_entries e on e.id = l.entry_id and e.status = 'posted'
      join accounts a on a.id = l.account_id and a.system_key = 'suspense'
     where l.entity_id = ${entityId}`);
  return BigInt(row?.bal ?? "0");
}

async function latestLockedPeriodEnd(tx: Tx, entityId: string): Promise<string | null> {
  const [row] = await tx
    .select({ endDate: schema.periods.endDate })
    .from(schema.periods)
    .where(and(eq(schema.periods.entityId, entityId), sql`${schema.periods.status} <> 'open'`))
    .orderBy(desc(schema.periods.endDate))
    .limit(1);
  return row?.endDate ?? null;
}

/**
 * Money in / out per month: movements on bank and cash accounts, excluding
 * entries that only move money between the business's own accounts.
 */
async function cashFlowsByMonth(tx: Tx, entityId: string, from: string, to: string): Promise<Map<string, { moneyIn: bigint; moneyOut: bigint }>> {
  const rows = await tx.execute<{ month: string; money_in: string; money_out: string }>(sql`
    select to_char(e.entry_date, 'YYYY-MM') as month, sum(l.debit)::text as money_in, sum(l.credit)::text as money_out
      from journal_lines l
      join journal_entries e on e.id = l.entry_id and e.status = 'posted'
      join accounts a on a.id = l.account_id and a.subtype in ('bank', 'cash')
     where l.entity_id = ${entityId} and e.entry_date between ${from} and ${to}
       and exists (
         select 1 from journal_lines o join accounts oa on oa.id = o.account_id
          where o.entry_id = e.id and oa.subtype not in ('bank', 'cash'))
     group by 1`);
  return new Map(rows.map((r) => [r.month, { moneyIn: BigInt(r.money_in), moneyOut: BigInt(r.money_out) }]));
}

export async function getDashboard(ctx: ServiceContext, entityId: string): Promise<Dashboard> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    const today = scope.today;
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7));
    const monthStart = formatIsoDate(y, m, 1);
    const trendStart = addMonths(y, m, -5);
    const trendFrom = formatIsoDate(trendStart.y, trendStart.m, 1);

    const accounts = await loadAccounts(tx, entityId);
    const canSeeLedger = can(scope.actor, "report.view", entityId, ctx.now);
    const lines = canSeeLedger ? await loadPostedLines(tx, entityId, today) : [];

    const bankRows = await tx.execute<{ id: string; name: string; balance: string }>(sql`
      select b.id, case when b.bank_name = 'Cash' then b.account_name else b.bank_name || ' – ' || b.account_name end as name,
             coalesce((select sum(l.debit) - sum(l.credit) from journal_lines l
                         join journal_entries e on e.id = l.entry_id and e.status = 'posted' and e.entry_date <= ${today}
                        where l.account_id = b.ledger_account_id), 0)::text as balance
        from bank_accounts b join accounts a on a.id = b.ledger_account_id
       where b.entity_id = ${entityId} and b.is_active order by a.code`);
    const flows = canSeeLedger ? await cashFlowsByMonth(tx, entityId, trendFrom, today) : new Map();
    const trend = Array.from({ length: 6 }, (_, i) => {
      const p = addMonths(trendStart.y, trendStart.m, i);
      const key = `${p.y}-${String(p.m).padStart(2, "0")}`;
      const f = flows.get(key) ?? { moneyIn: 0n, moneyOut: 0n };
      return { month: key, moneyIn: f.moneyIn.toString(), moneyOut: f.moneyOut.toString() };
    });
    const thisMonth = trend[trend.length - 1] ?? { moneyIn: "0", moneyOut: "0" };
    const top = categoryBreakdown(accounts, lines, "expense", monthStart, formatIsoDate(y, m, daysInMonth(y, m))).rows.slice(0, 5);

    const suspense = canSeeLedger ? await suspenseBalance(tx, entityId) : 0n;
    const drafts = await draftCount(tx, entityId);
    const [periodRow] = await tx
      .select({ startDate: schema.periods.startDate, endDate: schema.periods.endDate, status: schema.periods.status })
      .from(schema.periods)
      .where(and(eq(schema.periods.entityId, entityId), sql`${today} between ${schema.periods.startDate} and ${schema.periods.endDate}`));
    const [obe] = await tx.execute<{ bal: string; n: number }>(sql`
      select (coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0))::text as bal,
             (select count(*)::int from journal_entries where entity_id = ${entityId} and source_type = 'opening_balance' and status = 'posted') as n
        from journal_lines l
        join journal_entries e on e.id = l.entry_id and e.status = 'posted'
        join accounts a on a.id = l.account_id and a.system_key = 'opening_balance_equity'
       where l.entity_id = ${entityId}`);

    const base = `/e/${entityId}`;
    const attention: Dashboard["attention"] = [];
    if (accounts.length === 0) attention.push({ kind: "setup", message: "Finish setting up your books", href: `${base}/setup` });
    if ((obe?.n ?? 0) === 0 && accounts.length > 0) attention.push({ kind: "opening_balances", message: "Enter what you had on day one (opening balances)", href: `${base}/setup` });
    if (obe && obe.bal !== "0") attention.push({ kind: "opening_balance_equity", message: "Opening balances are not fully allocated yet", href: `${base}/setup` });
    if (suspense !== 0n) attention.push({ kind: "suspense", message: "Some money is waiting to be categorised (suspense)", href: `${base}/accounts` });
    if (drafts > 0) attention.push({ kind: "drafts", message: `${drafts} draft ${drafts === 1 ? "entry" : "entries"} not yet posted`, href: `${base}/journals?status=draft` });

    return {
      today,
      cash: { total: bankRows.reduce((sum, r) => sum + BigInt(r.balance), 0n).toString(), accounts: bankRows.map((r) => ({ id: r.id, name: r.name, balance: r.balance })) },
      thisMonth: { moneyIn: thisMonth.moneyIn, moneyOut: thisMonth.moneyOut },
      trend,
      topExpenses: top.map((r) => ({ name: r.account.name, amount: r.amount.toString() })),
      attention,
      accountant: {
        trialBalanceBalanced: trialBalance(accounts, lines, today).checks.every((c) => c.passed),
        suspenseBalance: suspense.toString(),
        draftCount: drafts,
        currentPeriod: periodRow ?? null,
        latestLockedPeriodEnd: await latestLockedPeriodEnd(tx, entityId),
      },
    };
  });
}

/** Firm practice workspace (SPEC §6.3, Phase 1 basic): every client the caller can see. */
export async function listPracticeClients(ctx: ServiceContext, orgId: string): Promise<{ clients: PracticeClient[] }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const actor = await loadActor(tx, claims, orgId);
    if (actor.orgRole === null) throw new PermissionDeniedError("report.view", "The practice workspace is for firm members");
    const entities = await tx.select().from(schema.entities).where(eq(schema.entities.orgId, orgId)).orderBy(schema.entities.legalName);
    const staff = await tx.execute<{ entity_id: string; user_id: string; name: string; role: string }>(sql`
      select ea.entity_id, ea.user_id, coalesce(u.full_name, u.email) as name, ea.role
        from entity_access ea join users u on u.id = ea.user_id
       where ea.org_id = ${orgId} and ea.role in ('accountant', 'bookkeeper')`);
    const clients: PracticeClient[] = [];
    for (const e of entities) {
      const visible = can(actor, "report.view", e.id, ctx.now);
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.accounts).where(eq(schema.accounts.entityId, e.id));
      clients.push({
        entityId: e.id,
        name: e.tradingName ?? e.legalName,
        assignedStaff: staff.filter((s) => s.entity_id === e.id).map((s) => ({ userId: s.user_id, name: s.name, role: s.role })),
        suspenseBalance: (visible ? await suspenseBalance(tx, e.id) : 0n).toString(),
        latestLockedPeriodEnd: await latestLockedPeriodEnd(tx, e.id),
        booksReady: (count?.n ?? 0) > 0,
        draftCount: await draftCount(tx, e.id),
      });
    }
    return { clients };
  });
}

/** Audit log viewer (SPEC §6.4): entity-level entries, newest first. */
export async function listAudit(
  ctx: ServiceContext,
  entityId: string,
  q: { action?: string; from?: string; to?: string; cursor?: string },
): Promise<{ entries: AuditEntry[]; nextCursor: string | null }> {
  const claims = requireClaims(ctx);
  const PAGE = 50;
  const offset = Number(q.cursor ?? "0") || 0;
  return withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    assertCan(scope.actor, "audit_log.view", entityId, ctx.now);
    const rows = await tx.execute<{
      id: string;
      at: Date;
      actor_name: string | null;
      action: string;
      target_type: string;
      target_id: string | null;
      entity_id: string | null;
      reason: string | null;
      before: unknown;
      after: unknown;
    }>(sql`
      select a.id, a.at, coalesce(u.full_name, u.email) as actor_name, a.action, a.target_type, a.target_id, a.entity_id, a.reason, a.before, a.after
        from audit_log a left join users u on u.id = a.actor_user_id
       where a.entity_id = ${entityId}
         ${q.action ? sql`and a.action like ${q.action.replace(/[%_\\]/g, "\\$&") + "%"}` : sql``}
         ${q.from ? sql`and a.at >= ${q.from}::date` : sql``}
         ${q.to ? sql`and a.at < (${q.to}::date + 1)` : sql``}
       order by a.at desc, a.id
       limit ${PAGE + 1} offset ${offset}`);
    if (!rows) throw new NotFoundError("Audit log");
    return {
      entries: rows.slice(0, PAGE).map((r) => ({
        id: r.id,
        at: new Date(r.at).toISOString(),
        actorName: r.actor_name,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        entityId: r.entity_id,
        reason: r.reason,
        before: r.before,
        after: r.after,
      })),
      nextCursor: rows.length > PAGE ? String(offset + PAGE) : null,
    };
  });
}
