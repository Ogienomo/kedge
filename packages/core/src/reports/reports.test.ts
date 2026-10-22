import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { typeOfSubtype, isBalanceSheetType, type AccountSubtype } from "../ledger/accounts";
import type { SourceType } from "../ledger/entry";
import { addDays, daysInMonth, formatIsoDate } from "../periods/dates";
import { accountLedger, balanceSheet, categoryBreakdown, incomeStatement, journalReport, trialBalance, type PostedLine, type ReportAccount } from "./reports";

function acc(id: string, code: string, subtype: AccountSubtype): ReportAccount {
  const type = typeOfSubtype(subtype);
  return { id, code, name: id, type, subtype, isLeaf: true, isActive: true, systemKey: null, parentId: null, cashFlowCategory: isBalanceSheetType(type) ? "none" : null };
}

const ACCOUNTS = [
  acc("bank", "1020", "bank"),
  acc("equipment", "1540", "non_current_asset"),
  acc("vat_out", "2100", "tax_payable"),
  acc("loan", "2500", "non_current_liability"),
  acc("capital", "3000", "equity_capital"),
  acc("re", "3100", "retained_earnings"),
  acc("sales", "4000", "revenue"),
  acc("cos", "5000", "cost_of_sales"),
  acc("rent", "6100", "operating_expense"),
  acc("fuel", "6200", "operating_expense"),
  acc("interest", "8200", "finance_cost"),
  acc("cit", "8500", "income_tax_expense"),
];

let seq = 0;
function entry(date: string, legs: [string, "D" | "C", bigint][], sourceType: SourceType = "manual"): PostedLine[] {
  seq++;
  return legs.map(([accountId, side, amount], i) => ({
    entryId: `e${seq}`,
    entryNumber: `JE-${date.slice(0, 4)}-${String(seq).padStart(6, "0")}`,
    entryDate: date,
    memo: `entry ${seq}`,
    sourceType,
    lineNo: i + 1,
    accountId,
    debit: side === "D" ? amount : 0n,
    credit: side === "C" ? amount : 0n,
    description: null,
    contactId: null,
  }));
}

/** A small ledger whose statements are worked out by hand in the comments. */
const LINES = [
  ...entry("2025-12-31", [["bank", "D", 1_000_000n], ["capital", "C", 1_000_000n]], "opening_balance"),
  // Prior year sale: profit 200,000 that has not been closed into retained earnings.
  ...entry("2025-12-31", [["bank", "D", 200_000n], ["sales", "C", 200_000n]]),
  ...entry("2026-01-05", [["bank", "D", 2_000_000n], ["loan", "C", 2_000_000n]]),
  ...entry("2026-01-10", [["equipment", "D", 1_500_000n], ["bank", "C", 1_500_000n]]),
  ...entry("2026-02-01", [["bank", "D", 1_075_000n], ["sales", "C", 1_000_000n], ["vat_out", "C", 75_000n]]),
  ...entry("2026-02-03", [["cos", "D", 400_000n], ["bank", "C", 400_000n]]),
  ...entry("2026-02-28", [["rent", "D", 150_000n], ["bank", "C", 150_000n]]),
  ...entry("2026-03-02", [["fuel", "D", 50_000n], ["bank", "C", 50_000n]]),
  ...entry("2026-03-31", [["interest", "D", 20_000n], ["bank", "C", 20_000n]]),
  ...entry("2026-03-31", [["cit", "D", 30_000n], ["bank", "C", 30_000n]]),
];

describe("reports on a hand-worked ledger", () => {
  it("trial balance at 31 March 2026", () => {
    const tb = trialBalance(ACCOUNTS, LINES, "2026-03-31");
    // bank: 1,000,000 + 200,000 + 2,000,000 − 1,500,000 + 1,075,000 − 400,000 − 150,000 − 50,000 − 20,000 − 30,000 = 2,125,000
    expect(tb.rows.map((r) => [r.account.id, r.debit, r.credit])).toEqual([
      ["bank", 2_125_000n, 0n],
      ["equipment", 1_500_000n, 0n],
      ["vat_out", 0n, 75_000n],
      ["loan", 0n, 2_000_000n],
      ["capital", 0n, 1_000_000n],
      ["sales", 0n, 1_200_000n],
      ["cos", 400_000n, 0n],
      ["rent", 150_000n, 0n],
      ["fuel", 50_000n, 0n],
      ["interest", 20_000n, 0n],
      ["cit", 30_000n, 0n],
    ]);
    expect(tb.totalDebit).toBe(4_275_000n);
    expect(tb.totalCredit).toBe(4_275_000n);
    expect(tb.checks.every((c) => c.passed)).toBe(true);
  });

  it("income statement for Q1 2026", () => {
    const pl = incomeStatement(ACCOUNTS, LINES, "2026-01-01", "2026-03-31");
    expect(pl.revenue.total).toBe(1_000_000n);
    expect(pl.costOfSales.total).toBe(400_000n);
    expect(pl.grossProfit).toBe(600_000n);
    expect(pl.operatingExpenses.total).toBe(200_000n);
    expect(pl.operatingProfit).toBe(400_000n);
    expect(pl.financeCosts.total).toBe(20_000n);
    expect(pl.profitBeforeTax).toBe(380_000n);
    expect(pl.incomeTax.total).toBe(30_000n);
    expect(pl.profitForPeriod).toBe(350_000n);
  });

  it("balance sheet at 31 March 2026 balances with prior and current year earnings", () => {
    const bs = balanceSheet(ACCOUNTS, LINES, "2026-03-31", "2026-01-01");
    expect(bs.nonCurrentAssets.total).toBe(1_500_000n);
    expect(bs.currentAssets.total).toBe(2_125_000n);
    expect(bs.totalAssets).toBe(3_625_000n);
    expect(bs.currentLiabilities.total).toBe(75_000n);
    expect(bs.nonCurrentLiabilities.total).toBe(2_000_000n);
    expect(bs.equity.total).toBe(1_000_000n);
    expect(bs.priorYearsEarnings).toBe(200_000n);
    expect(bs.currentYearEarnings).toBe(350_000n);
    expect(bs.totalEquity).toBe(1_550_000n);
    expect(bs.checks.every((c) => c.passed)).toBe(true);
  });

  it("account ledger with running balance; P&L opening counts from the fiscal year start", () => {
    const bank = accountLedger(ACCOUNTS[0] as ReportAccount, LINES, "2026-02-01", "2026-02-28", "2026-01-01");
    expect(bank.opening).toBe(1_700_000n);
    expect(bank.rows.map((r) => r.balance)).toEqual([2_775_000n, 2_375_000n, 2_225_000n]);
    expect(bank.closing).toBe(2_225_000n);
    const sales = accountLedger(ACCOUNTS[6] as ReportAccount, LINES, "2026-03-01", "2026-03-31", "2026-01-01");
    expect(sales.opening).toBe(1_000_000n); // excludes the 2025 sale
  });

  it("journal report groups lines into entries", () => {
    const j = journalReport(LINES, "2026-02-01", "2026-02-28");
    expect(j.map((e) => [e.date, e.total, e.lines.length])).toEqual([
      ["2026-02-01", 1_075_000n, 3],
      ["2026-02-03", 400_000n, 2],
      ["2026-02-28", 150_000n, 2],
    ]);
  });

  it("expense by category, largest first, with shares", () => {
    const c = categoryBreakdown(ACCOUNTS, LINES, "expense", "2026-01-01", "2026-03-31");
    expect(c.total).toBe(650_000n);
    expect(c.rows.map((r) => [r.account.id, r.amount, r.shareBps])).toEqual([
      ["cos", 400_000n, 6153],
      ["rent", 150_000n, 2307],
      ["fuel", 50_000n, 769],
      ["cit", 30_000n, 461],
      ["interest", 20_000n, 307],
    ]);
  });

  it("reports an unbalanced ledger instead of hiding it", () => {
    const broken = [...LINES, ...entry("2026-03-31", [["bank", "D", 1n]])];
    expect(trialBalance(ACCOUNTS, broken, "2026-03-31").checks[0]?.passed).toBe(false);
    expect(balanceSheet(ACCOUNTS, broken, "2026-03-31", "2026-01-01").checks.some((c) => !c.passed)).toBe(true);
  });
});

/**
 * AC-1.7: for 10,000 randomly generated valid entries, the trial balance
 * always balances and assets = liabilities + equity (including current year
 * earnings) at every date.
 */
describe("ledger invariants (AC-1.7, property-based)", () => {
  const ids = ACCOUNTS.map((a) => a.id);

  const entryArb = fc
    .record({
      day: fc.integer({ min: 0, max: 729 }),
      legs: fc.array(fc.record({ account: fc.constantFrom(...ids), amount: fc.bigInt({ min: 1n, max: 10n ** 11n }), debit: fc.boolean() }), { minLength: 1, maxLength: 5 }),
      balancer: fc.constantFrom(...ids),
    })
    .map(({ day, legs, balancer }) => {
      const diff = legs.reduce((s, l) => s + (l.debit ? l.amount : -l.amount), 0n);
      const all = [...legs, ...(diff !== 0n ? [{ account: balancer, amount: diff > 0n ? diff : -diff, debit: diff < 0n }] : [])];
      return { date: addDays("2025-01-01", day), legs: all.map((l) => [l.account, l.debit ? "D" : "C", l.amount] as [string, "D" | "C", bigint]) };
    })
    .filter((e) => e.legs.length >= 2);

  it("holds at every month end over 10,000 random entries", () => {
    const sample = fc.sample(fc.array(entryArb, { minLength: 10_000, maxLength: 10_000 }), { numRuns: 1, seed: 20261022 })[0] ?? [];
    expect(sample.length).toBe(10_000);
    const lines = sample.flatMap((e) => entry(e.date, e.legs));
    for (let m = 0; m < 24; m++) {
      const y = 2025 + Math.floor(m / 12);
      const month = (m % 12) + 1;
      const asOf = formatIsoDate(y, month, daysInMonth(y, month));
      const fyStart = `${asOf.slice(0, 4)}-01-01`;
      const tb = trialBalance(ACCOUNTS, lines, asOf);
      expect(tb.totalDebit).toBe(tb.totalCredit);
      const bs = balanceSheet(ACCOUNTS, lines, asOf, fyStart);
      expect(bs.totalAssets).toBe(bs.totalLiabilities + bs.totalEquity);
    }
  });

  it("holds at random dates for random ledgers", () => {
    fc.assert(
      fc.property(fc.array(entryArb, { minLength: 1, maxLength: 60 }), fc.integer({ min: 0, max: 729 }), (entries, day) => {
        const lines = entries.flatMap((e) => entry(e.date, e.legs));
        const asOf = addDays("2025-01-01", day);
        const fyStart = `${asOf.slice(0, 4)}-01-01`;
        const bs = balanceSheet(ACCOUNTS, lines, asOf, fyStart);
        return bs.checks.every((c) => c.passed);
      }),
      { numRuns: 300 },
    );
  });
});
