/**
 * Financial reports (SPEC §9), computed only from posted journal lines
 * (rule 6). Every report carries integrity checks (rule 7); a failure is a
 * P1 bug and must never be hidden by the UI.
 */
import { isBalanceSheetType, normalBalance, type AccountSubtype, type AccountType, type CashFlowCategory, type LedgerAccount } from "../ledger/accounts";
import type { SourceType } from "../ledger/entry";
import type { IsoDate } from "../periods/dates";

export interface ReportAccount extends LedgerAccount {
  readonly parentId: string | null;
  readonly cashFlowCategory: CashFlowCategory | null;
}

/** One posted journal line, as reports read it. */
export interface PostedLine {
  readonly entryId: string;
  readonly entryNumber: string;
  readonly entryDate: IsoDate;
  readonly memo: string;
  readonly sourceType: SourceType;
  readonly lineNo: number;
  readonly accountId: string;
  readonly debit: bigint;
  readonly credit: bigint;
  readonly description: string | null;
  readonly contactId: string | null;
}

export interface IntegrityCheck {
  readonly name: "trial_balance" | "accounting_equation";
  readonly passed: boolean;
  readonly detail: string;
}

interface Totals {
  debit: bigint;
  credit: bigint;
}

/** Sums of debits and credits per account for lines matching `include`. */
function totalsByAccount(lines: readonly PostedLine[], include: (l: PostedLine) => boolean): Map<string, Totals> {
  const out = new Map<string, Totals>();
  for (const l of lines) {
    if (!include(l)) continue;
    const t = out.get(l.accountId) ?? { debit: 0n, credit: 0n };
    t.debit += l.debit;
    t.credit += l.credit;
    out.set(l.accountId, t);
  }
  return out;
}

function byCode(a: { account: ReportAccount }, b: { account: ReportAccount }): number {
  return a.account.code.localeCompare(b.account.code);
}

// ---------------------------------------------------------------------------
// Trial balance
// ---------------------------------------------------------------------------

export interface TrialBalanceRow {
  readonly account: ReportAccount;
  /** Net balance on the debit side (0 if the account is in credit). */
  readonly debit: bigint;
  readonly credit: bigint;
}

export interface TrialBalance {
  readonly asOf: IsoDate;
  readonly rows: readonly TrialBalanceRow[];
  readonly totalDebit: bigint;
  readonly totalCredit: bigint;
  readonly checks: readonly IntegrityCheck[];
}

export function trialBalance(accounts: readonly ReportAccount[], lines: readonly PostedLine[], asOf: IsoDate, opts: { includeZero?: boolean } = {}): TrialBalance {
  const sums = totalsByAccount(lines, (l) => l.entryDate <= asOf);
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const account of accounts) {
    const t = sums.get(account.id) ?? { debit: 0n, credit: 0n };
    const net = t.debit - t.credit;
    if (net === 0n && !opts.includeZero) continue;
    const row = { account, debit: net > 0n ? net : 0n, credit: net < 0n ? -net : 0n };
    totalDebit += row.debit;
    totalCredit += row.credit;
    rows.push(row);
  }
  rows.sort(byCode);
  return {
    asOf,
    rows,
    totalDebit,
    totalCredit,
    checks: [{ name: "trial_balance", passed: totalDebit === totalCredit, detail: `Debits ${totalDebit}, credits ${totalCredit}` }],
  };
}

// ---------------------------------------------------------------------------
// General ledger
// ---------------------------------------------------------------------------

export interface LedgerRow {
  readonly line: PostedLine;
  /** Running balance in the account's normal direction. */
  readonly balance: bigint;
}

export interface AccountLedger {
  readonly account: ReportAccount;
  readonly opening: bigint;
  readonly rows: readonly LedgerRow[];
  readonly closing: bigint;
  readonly totalDebit: bigint;
  readonly totalCredit: bigint;
}

/**
 * Opening balance of an account at `from`. Income and expense accounts
 * accumulate only within the fiscal year, so their opening counts from
 * `fiscalYearStart`; balance sheet accounts count from the beginning.
 */
function openingBalance(account: ReportAccount, lines: readonly PostedLine[], from: IsoDate, fiscalYearStart: IsoDate): bigint {
  const startBound = isBalanceSheetType(account.type) ? "" : fiscalYearStart;
  let debit = 0n;
  let credit = 0n;
  for (const l of lines) {
    if (l.accountId !== account.id || l.entryDate >= from || l.entryDate < startBound) continue;
    debit += l.debit;
    credit += l.credit;
  }
  return normalBalance(account.type, debit, credit);
}

function compareLines(a: PostedLine, b: PostedLine): number {
  return a.entryDate.localeCompare(b.entryDate) || a.entryNumber.localeCompare(b.entryNumber) || a.lineNo - b.lineNo;
}

export function accountLedger(account: ReportAccount, lines: readonly PostedLine[], from: IsoDate, to: IsoDate, fiscalYearStart: IsoDate): AccountLedger {
  const opening = openingBalance(account, lines, from, fiscalYearStart);
  let balance = opening;
  let totalDebit = 0n;
  let totalCredit = 0n;
  const rows = lines
    .filter((l) => l.accountId === account.id && l.entryDate >= from && l.entryDate <= to)
    .sort(compareLines)
    .map((line) => {
      balance += normalBalance(account.type, line.debit, line.credit);
      totalDebit += line.debit;
      totalCredit += line.credit;
      return { line, balance };
    });
  return { account, opening, rows, closing: balance, totalDebit, totalCredit };
}

export function generalLedger(
  accounts: readonly ReportAccount[],
  lines: readonly PostedLine[],
  range: { from: IsoDate; to: IsoDate; fiscalYearStart: IsoDate },
  opts: { includeZero?: boolean } = {},
): AccountLedger[] {
  return accounts
    .map((a) => accountLedger(a, lines, range.from, range.to, range.fiscalYearStart))
    .filter((l) => opts.includeZero || l.rows.length > 0 || l.opening !== 0n)
    .sort(byCode);
}

// ---------------------------------------------------------------------------
// Income statement (P&L)
// ---------------------------------------------------------------------------

export interface StatementRow {
  readonly account: ReportAccount;
  /** Natural sign: income positive when earned, expense positive when incurred, assets positive, liabilities/equity positive. */
  readonly amount: bigint;
}

export interface StatementSection {
  readonly key: string;
  readonly rows: readonly StatementRow[];
  readonly total: bigint;
}

function section(key: string, accounts: readonly ReportAccount[], sums: Map<string, Totals>, match: (a: ReportAccount) => boolean, includeZero: boolean): StatementSection {
  const rows = accounts
    .filter(match)
    .map((account) => {
      const t = sums.get(account.id) ?? { debit: 0n, credit: 0n };
      return { account, amount: normalBalance(account.type, t.debit, t.credit) };
    })
    .filter((r) => includeZero || r.amount !== 0n)
    .sort(byCode);
  return { key, rows, total: rows.reduce((s, r) => s + r.amount, 0n) };
}

export interface IncomeStatement {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly revenue: StatementSection;
  readonly costOfSales: StatementSection;
  readonly grossProfit: bigint;
  readonly operatingExpenses: StatementSection;
  readonly operatingProfit: bigint;
  readonly otherIncome: StatementSection;
  readonly financeCosts: StatementSection;
  readonly profitBeforeTax: bigint;
  readonly incomeTax: StatementSection;
  readonly profitForPeriod: bigint;
}

const is = (...subtypes: AccountSubtype[]) => (a: ReportAccount) => subtypes.includes(a.subtype);

/** Profit for a set of lines: income credits minus expense debits. */
export function netProfit(accounts: readonly ReportAccount[], lines: readonly PostedLine[], include: (l: PostedLine) => boolean): bigint {
  const types = new Map(accounts.map((a) => [a.id, a.type]));
  let profit = 0n;
  for (const l of lines) {
    if (!include(l)) continue;
    const t = types.get(l.accountId);
    if (t === "income" || t === "expense") profit += l.credit - l.debit;
  }
  return profit;
}

export function incomeStatement(accounts: readonly ReportAccount[], lines: readonly PostedLine[], from: IsoDate, to: IsoDate, opts: { includeZero?: boolean } = {}): IncomeStatement {
  // Year-end closing entries move the year's profit to retained earnings; they
  // are not part of the period's performance.
  const sums = totalsByAccount(lines, (l) => l.entryDate >= from && l.entryDate <= to && l.sourceType !== "year_end_close");
  const z = opts.includeZero ?? false;
  const revenue = section("revenue", accounts, sums, is("revenue"), z);
  const costOfSales = section("cost_of_sales", accounts, sums, is("cost_of_sales"), z);
  const operatingExpenses = section("operating_expenses", accounts, sums, is("operating_expense"), z);
  const otherIncome = section("other_income", accounts, sums, is("other_income"), z);
  const financeCosts = section("finance_costs", accounts, sums, is("finance_cost"), z);
  const incomeTax = section("income_tax", accounts, sums, is("income_tax_expense"), z);
  const grossProfit = revenue.total - costOfSales.total;
  const operatingProfit = grossProfit - operatingExpenses.total;
  const profitBeforeTax = operatingProfit + otherIncome.total - financeCosts.total;
  return {
    from,
    to,
    revenue,
    costOfSales,
    grossProfit,
    operatingExpenses,
    operatingProfit,
    otherIncome,
    financeCosts,
    profitBeforeTax,
    incomeTax,
    profitForPeriod: profitBeforeTax - incomeTax.total,
  };
}

// ---------------------------------------------------------------------------
// Balance sheet (statement of financial position)
// ---------------------------------------------------------------------------

export interface BalanceSheet {
  readonly asOf: IsoDate;
  readonly nonCurrentAssets: StatementSection;
  readonly currentAssets: StatementSection;
  readonly totalAssets: bigint;
  readonly equity: StatementSection;
  /** Prior years' unclosed profit, shown with retained earnings. */
  readonly priorYearsEarnings: bigint;
  /** "Current year earnings" (SPEC §4.5): profit from the fiscal year start to `asOf`. */
  readonly currentYearEarnings: bigint;
  readonly totalEquity: bigint;
  readonly nonCurrentLiabilities: StatementSection;
  readonly currentLiabilities: StatementSection;
  readonly totalLiabilities: bigint;
  readonly checks: readonly IntegrityCheck[];
}

export function balanceSheet(
  accounts: readonly ReportAccount[],
  lines: readonly PostedLine[],
  asOf: IsoDate,
  fiscalYearStart: IsoDate,
  opts: { includeZero?: boolean } = {},
): BalanceSheet {
  const sums = totalsByAccount(lines, (l) => l.entryDate <= asOf);
  const z = opts.includeZero ?? false;
  const nonCurrentAssets = section("non_current_assets", accounts, sums, is("non_current_asset"), z);
  const currentAssets = section("current_assets", accounts, sums, is("current_asset", "bank", "cash", "receivable", "inventory"), z);
  const equity = section("equity", accounts, sums, (a) => a.type === "equity", z);
  const nonCurrentLiabilities = section("non_current_liabilities", accounts, sums, is("non_current_liability"), z);
  const currentLiabilities = section("current_liabilities", accounts, sums, is("current_liability", "payable", "tax_payable"), z);

  const priorYearsEarnings = netProfit(accounts, lines, (l) => l.entryDate < fiscalYearStart);
  const currentYearEarnings = netProfit(accounts, lines, (l) => l.entryDate >= fiscalYearStart && l.entryDate <= asOf);

  const totalAssets = nonCurrentAssets.total + currentAssets.total;
  const totalLiabilities = nonCurrentLiabilities.total + currentLiabilities.total;
  const totalEquity = equity.total + priorYearsEarnings + currentYearEarnings;
  const balanced = totalAssets === totalLiabilities + totalEquity;

  return {
    asOf,
    nonCurrentAssets,
    currentAssets,
    totalAssets,
    equity,
    priorYearsEarnings,
    currentYearEarnings,
    totalEquity,
    nonCurrentLiabilities,
    currentLiabilities,
    totalLiabilities,
    checks: [
      trialBalance(accounts, lines, asOf).checks[0] as IntegrityCheck,
      {
        name: "accounting_equation",
        passed: balanced,
        detail: `Assets ${totalAssets}; liabilities ${totalLiabilities} + equity ${totalEquity} = ${totalLiabilities + totalEquity}`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Journal report and category breakdowns
// ---------------------------------------------------------------------------

export interface JournalReportEntry {
  readonly entryId: string;
  readonly number: string;
  readonly date: IsoDate;
  readonly memo: string;
  readonly sourceType: SourceType;
  readonly lines: readonly PostedLine[];
  readonly total: bigint;
}

export function journalReport(lines: readonly PostedLine[], from: IsoDate, to: IsoDate, sourceType?: SourceType): JournalReportEntry[] {
  const byEntry = new Map<string, PostedLine[]>();
  for (const l of lines) {
    if (l.entryDate < from || l.entryDate > to || (sourceType && l.sourceType !== sourceType)) continue;
    byEntry.set(l.entryId, [...(byEntry.get(l.entryId) ?? []), l]);
  }
  return [...byEntry.values()]
    .map((ls) => {
      const sorted = [...ls].sort((a, b) => a.lineNo - b.lineNo);
      const first = sorted[0] as PostedLine;
      return { entryId: first.entryId, number: first.entryNumber, date: first.entryDate, memo: first.memo, sourceType: first.sourceType, lines: sorted, total: sorted.reduce((s, l) => s + l.debit, 0n) };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
}

export interface CategoryRow {
  readonly account: ReportAccount;
  readonly amount: bigint;
  /** Share of the total, in basis points (integer; 10000 = 100%). */
  readonly shareBps: number;
}

/** "Expense by category" / "Income by source" (simple-mode friendly breakdowns). */
export function categoryBreakdown(accounts: readonly ReportAccount[], lines: readonly PostedLine[], type: Extract<AccountType, "income" | "expense">, from: IsoDate, to: IsoDate): { rows: CategoryRow[]; total: bigint } {
  const sums = totalsByAccount(lines, (l) => l.entryDate >= from && l.entryDate <= to && l.sourceType !== "year_end_close");
  const rows = accounts
    .filter((a) => a.type === type && a.systemKey !== "rounding")
    .map((account) => {
      const t = sums.get(account.id) ?? { debit: 0n, credit: 0n };
      return { account, amount: normalBalance(account.type, t.debit, t.credit) };
    })
    .filter((r) => r.amount !== 0n);
  const total = rows.reduce((s, r) => s + r.amount, 0n);
  return {
    total,
    rows: rows
      .map((r) => ({ ...r, shareBps: total === 0n ? 0 : Number((r.amount * 10_000n) / total) }))
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : a.account.code.localeCompare(b.account.code))),
  };
}
