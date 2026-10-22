import type { ReportKey, ReportQuery, ReportResponse } from "@kedge/api";
import { reportQuerySchema } from "@kedge/api";
import {
  accountLedger,
  addDays,
  assertCan,
  balanceSheet,
  categoryBreakdown,
  daysBetween,
  incomeStatement,
  journalReport,
  NotFoundError,
  trialBalance,
  ValidationError,
  type BalanceSheet,
  type IncomeStatement,
  type IntegrityCheck,
  type PostedLine,
  type ReportAccount,
  type StatementSection,
} from "@kedge/core";
import { withUser } from "@kedge/db";
import { requireClaims, type ServiceContext } from "../../context";
import { reportToCsv, reportToXlsx } from "../../exports";
import { entityScope, fiscalYearStartFor, loadAccounts, loadPostedLines } from "./scope";

const ref = (a: ReportAccount) => ({ id: a.id, code: a.code, name: a.name, subtype: a.subtype });
const s = (v: bigint) => v.toString();

function section(cur: StatementSection, cmp: StatementSection | null) {
  const cmpBy = new Map(cmp?.rows.map((r) => [r.account.id, r.amount]) ?? []);
  const ids = new Set(cur.rows.map((r) => r.account.id));
  // Rows present only in the comparative period still appear, with a zero current amount.
  const extra = cmp?.rows.filter((r) => !ids.has(r.account.id)).map((r) => ({ account: r.account, amount: 0n })) ?? [];
  const rows = [...cur.rows, ...extra].sort((a, b) => a.account.code.localeCompare(b.account.code));
  return {
    key: cur.key,
    rows: rows.map((r) => ({ account: ref(r.account), amount: s(r.amount), comparative: cmp ? s(cmpBy.get(r.account.id) ?? 0n) : null })),
    total: s(cur.total),
    comparativeTotal: cmp ? s(cmp.total) : null,
  };
}

const fig = (a: bigint, b: bigint | null) => ({ amount: s(a), comparative: b === null ? null : s(b) });

function shiftYear(date: string, years: number): string {
  const y = Number(date.slice(0, 4)) + years;
  const md = date.slice(5);
  // 29 February in a non-leap year becomes 28 February.
  if (md === "02-29" && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) return `${y}-02-28`;
  return `${y}-${md}`;
}

function comparisonRange(from: string, to: string, compare: "none" | "previous_period" | "previous_year"): { from: string; to: string } | null {
  switch (compare) {
    case "none":
      return null;
    case "previous_year":
      return { from: shiftYear(from, -1), to: shiftYear(to, -1) };
    case "previous_period": {
      const days = daysBetween(from, to);
      const cmpTo = addDays(from, -1);
      return { from: addDays(cmpTo, -days), to: cmpTo };
    }
  }
}

function tbChecks(accounts: ReportAccount[], lines: PostedLine[], asOf: string): IntegrityCheck[] {
  return [...trialBalance(accounts, lines, asOf).checks];
}

/**
 * Runs one report (SPEC §9). Every report carries integrity checks; the UI
 * must show any failure in a blocking banner (rule 7).
 */
export async function runReport(ctx: ServiceContext, entityId: string, report: ReportKey, raw: ReportQuery): Promise<ReportResponse> {
  const claims = requireClaims(ctx);
  const q = reportQuerySchema.parse(raw);
  return withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    assertCan(scope.actor, "report.view", entityId, ctx.now);
    const accounts = await loadAccounts(tx, entityId);
    const startMonth = scope.entity.fiscalYearStartMonth;
    const asOf = q.asOf ?? q.to ?? scope.today;
    const to = q.to ?? scope.today;
    const from = q.from ?? (await fiscalYearStartFor(tx, entityId, to, startMonth));
    if (from > to) throw new ValidationError("The start date is after the end date", [{ path: "from", message: "After end date" }]);
    const lines = await loadPostedLines(tx, entityId);

    switch (report) {
      case "trial-balance": {
        const tb = trialBalance(accounts, lines, asOf, { includeZero: q.includeZero });
        return {
          report,
          asOf,
          rows: tb.rows.map((r) => ({ account: ref(r.account), debit: s(r.debit), credit: s(r.credit) })),
          totalDebit: s(tb.totalDebit),
          totalCredit: s(tb.totalCredit),
          checks: [...tb.checks],
        };
      }
      case "general-ledger": {
        const fyStart = await fiscalYearStartFor(tx, entityId, from, startMonth);
        const selected = q.accountId ? accounts.filter((a) => a.id === q.accountId) : accounts;
        if (q.accountId && selected.length === 0) throw new NotFoundError("Account");
        const ledgers = selected
          .map((a) => accountLedger(a, lines, from, to, fyStart))
          .filter((l) => q.includeZero || q.accountId || l.rows.length > 0 || l.opening !== 0n);
        return {
          report,
          from,
          to,
          accounts: ledgers.map((l) => ({
            account: ref(l.account),
            opening: s(l.opening),
            closing: s(l.closing),
            totalDebit: s(l.totalDebit),
            totalCredit: s(l.totalCredit),
            rows: l.rows.map((r) => ({
              entryId: r.line.entryId,
              entryNumber: r.line.entryNumber,
              date: r.line.entryDate,
              memo: r.line.memo,
              description: r.line.description,
              debit: s(r.line.debit),
              credit: s(r.line.credit),
              balance: s(r.balance),
            })),
          })),
          checks: tbChecks(accounts, lines, to),
        };
      }
      case "income-statement": {
        const cur = incomeStatement(accounts, lines, from, to, { includeZero: q.includeZero });
        const range = comparisonRange(from, to, q.compare);
        const cmp: IncomeStatement | null = range ? incomeStatement(accounts, lines, range.from, range.to, { includeZero: q.includeZero }) : null;
        return {
          report,
          from,
          to,
          comparativeFrom: range?.from ?? null,
          comparativeTo: range?.to ?? null,
          revenue: section(cur.revenue, cmp?.revenue ?? null),
          costOfSales: section(cur.costOfSales, cmp?.costOfSales ?? null),
          grossProfit: fig(cur.grossProfit, cmp?.grossProfit ?? null),
          operatingExpenses: section(cur.operatingExpenses, cmp?.operatingExpenses ?? null),
          operatingProfit: fig(cur.operatingProfit, cmp?.operatingProfit ?? null),
          otherIncome: section(cur.otherIncome, cmp?.otherIncome ?? null),
          financeCosts: section(cur.financeCosts, cmp?.financeCosts ?? null),
          profitBeforeTax: fig(cur.profitBeforeTax, cmp?.profitBeforeTax ?? null),
          incomeTax: section(cur.incomeTax, cmp?.incomeTax ?? null),
          profitForPeriod: fig(cur.profitForPeriod, cmp?.profitForPeriod ?? null),
          checks: tbChecks(accounts, lines, to),
        };
      }
      case "balance-sheet": {
        const fyStart = await fiscalYearStartFor(tx, entityId, asOf, startMonth);
        const cur = balanceSheet(accounts, lines, asOf, fyStart, { includeZero: q.includeZero });
        let cmp: BalanceSheet | null = null;
        let cmpAsOf: string | null = null;
        if (q.compare !== "none") {
          cmpAsOf = q.compare === "previous_year" ? shiftYear(asOf, -1) : addDays(fyStart, -1);
          cmp = balanceSheet(accounts, lines, cmpAsOf, await fiscalYearStartFor(tx, entityId, cmpAsOf, startMonth), { includeZero: q.includeZero });
        }
        return {
          report,
          asOf,
          comparativeAsOf: cmpAsOf,
          nonCurrentAssets: section(cur.nonCurrentAssets, cmp?.nonCurrentAssets ?? null),
          currentAssets: section(cur.currentAssets, cmp?.currentAssets ?? null),
          totalAssets: fig(cur.totalAssets, cmp?.totalAssets ?? null),
          equity: section(cur.equity, cmp?.equity ?? null),
          priorYearsEarnings: fig(cur.priorYearsEarnings, cmp?.priorYearsEarnings ?? null),
          currentYearEarnings: fig(cur.currentYearEarnings, cmp?.currentYearEarnings ?? null),
          totalEquity: fig(cur.totalEquity, cmp?.totalEquity ?? null),
          nonCurrentLiabilities: section(cur.nonCurrentLiabilities, cmp?.nonCurrentLiabilities ?? null),
          currentLiabilities: section(cur.currentLiabilities, cmp?.currentLiabilities ?? null),
          totalLiabilities: fig(cur.totalLiabilities, cmp?.totalLiabilities ?? null),
          checks: [...cur.checks, ...(cmp ? cmp.checks.filter((c) => !c.passed) : [])],
        };
      }
      case "journal": {
        const byId = new Map(accounts.map((a) => [a.id, a]));
        const entries = journalReport(lines, from, to, q.sourceType);
        return {
          report,
          from,
          to,
          entries: entries.map((e) => ({
            entryId: e.entryId,
            number: e.number,
            date: e.date,
            memo: e.memo,
            sourceType: e.sourceType,
            total: s(e.total),
            lines: e.lines.map((l) => {
              const a = byId.get(l.accountId);
              if (!a) throw new NotFoundError("Account");
              return { account: ref(a), debit: s(l.debit), credit: s(l.credit), description: l.description };
            }),
          })),
          checks: tbChecks(accounts, lines, to),
        };
      }
      case "expense-by-category":
      case "income-by-source": {
        const c = categoryBreakdown(accounts, lines, report === "expense-by-category" ? "expense" : "income", from, to);
        return {
          report,
          from,
          to,
          total: s(c.total),
          rows: c.rows.map((r) => ({ account: ref(r.account), amount: s(r.amount), shareBps: r.shareBps })),
          checks: tbChecks(accounts, lines, to),
        };
      }
    }
  });
}

/** Report export as CSV or XLSX (SPEC §9.1). PDF export awaits a library decision. */
export async function exportReport(ctx: ServiceContext, entityId: string, report: ReportKey, raw: ReportQuery, format: "csv" | "xlsx"): Promise<Response> {
  const data = await runReport(ctx, entityId, report, raw);
  const claims = requireClaims(ctx);
  const name = await withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    assertCan(scope.actor, "data.export", entityId, ctx.now);
    return scope.entity.tradingName ?? scope.entity.legalName;
  });
  const stamp = "asOf" in data ? data.asOf : `${data.from}_${data.to}`;
  const filename = `${name.replace(/[^A-Za-z0-9]+/g, "-")}_${report}_${stamp}.${format}`;
  const body = format === "csv" ? reportToCsv(data, name) : await reportToXlsx(data, name);
  return new Response(new Uint8Array(typeof body === "string" ? Buffer.from(body, "utf8") : body), {
    headers: {
      "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
