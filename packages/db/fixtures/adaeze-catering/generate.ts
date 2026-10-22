/**
 * Golden dataset generator: "Adaeze Catering Ltd", fiscal year 2025.
 *
 * Writes:
 *   dataset.json        company set-up, opening trial balance, ~430 transactions
 *   expected.json       expected trial balance, P&L and balance sheet (to the kobo)
 *   transactions.csv    every transaction with its debits and credits, for review
 *   expected-tb.csv     the expected trial balance, for review
 *
 * STATUS: DRAFT. The expected figures are computed here by a deliberately
 * separate, simple implementation (no @kedge/core posting map or reports),
 * so the golden test cross-checks the product. They still need to be
 * verified by hand by a qualified accountant before they count as
 * "hand-verified" (CLAUDE.md, testing requirements).
 *
 * Run: pnpm --filter @kedge/db exec tsx fixtures/adaeze-catering/generate.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL(".", import.meta.url));

// ------------------------------------------------------------ deterministic randomness
let seed = 20250101;
function rand(): number {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
/** Whole naira between lo and hi, in steps of `step` naira, as kobo. */
const naira = (lo: number, hi: number, step = 500) => BigInt(between(lo / step, hi / step) * step) * 100n;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;

// ------------------------------------------------------------ independent posting rules
/** Half away from zero, positive integers only (all fixture amounts are positive). */
const roundDiv = (n: bigint, d: bigint) => (n * 2n + d) / (d * 2n);
const VAT_BPS = 750n;
const WHT_BPS = 500n; // FIXTURE ONLY: not a verified WHT rate.

type Leg = [code: string, side: "D" | "C", amount: bigint];

export interface FixtureTxn {
  ref: string;
  date: string;
  kind: "money_in" | "money_out" | "transfer" | "owner_in" | "owner_out" | "loan_in" | "loan_repay" | "journal";
  description: string;
  /** kobo, as a string. For journals: unused. */
  amount: string;
  bankCode?: string;
  counterCode?: string;
  vat?: boolean;
  wht?: boolean;
  interest?: string;
  interestCode?: string;
  contact?: string;
  /** Manual journals only. */
  lines?: { code: string; debit: string; credit: string }[];
  /** The legs this generator expects the product to post. */
  expected: { code: string; debit: string; credit: string }[];
}

function legsFor(t: Omit<FixtureTxn, "expected">): Leg[] {
  const amount = BigInt(t.amount);
  const bank = t.bankCode ?? "1020";
  switch (t.kind) {
    case "money_in": {
      const vat = t.vat ? roundDiv(amount * VAT_BPS, 10_000n) : 0n;
      const wht = t.wht ? roundDiv(amount * WHT_BPS, 10_000n) : 0n;
      const legs: Leg[] = [[bank, "D", amount + vat - wht]];
      if (wht) legs.push(["1410", "D", wht]);
      legs.push([t.counterCode as string, "C", amount]);
      if (vat) legs.push(["2100", "C", vat]);
      return legs;
    }
    case "money_out": {
      const vat = t.vat ? roundDiv(amount * VAT_BPS, 10_000n) : 0n;
      const legs: Leg[] = [[t.counterCode as string, "D", amount]];
      if (vat) legs.push(["1400", "D", vat]);
      legs.push([bank, "C", amount + vat]);
      return legs;
    }
    case "transfer":
      return [
        [t.counterCode as string, "D", amount],
        [bank, "C", amount],
      ];
    case "owner_in":
    case "loan_in":
      return [
        [bank, "D", amount],
        [t.counterCode as string, "C", amount],
      ];
    case "owner_out":
      return [
        [t.counterCode as string, "D", amount],
        [bank, "C", amount],
      ];
    case "loan_repay": {
      const interest = BigInt(t.interest ?? "0");
      return [
        [t.counterCode as string, "D", amount - interest],
        [t.interestCode as string, "D", interest],
        [bank, "C", amount],
      ];
    }
    case "journal":
      return (t.lines ?? []).map((l) => (BigInt(l.debit) > 0n ? [l.code, "D", BigInt(l.debit)] : [l.code, "C", BigInt(l.credit)]));
  }
}

// ------------------------------------------------------------ the company
const company = {
  legalName: "Adaeze Catering Ltd",
  tradingName: "Adaeze Kitchen",
  rcNumber: "RC 1234567",
  tin: "12345678-0001",
  vatRegistered: true,
  industry: "Food services and catering",
  fiscalYearStartMonth: 1,
  goLiveDate: "2025-01-01",
  coaTemplate: "general_sme" as const,
  bankAccounts: [{ bankName: "GTBank", accountName: "Current", kind: "current" as const }],
  whtCode: { codeKey: "WHT_CONTRACTS_FIXTURE", name: "WHT on contracts (fixture rate, unverified)", rateBps: Number(WHT_BPS), effectiveFrom: "2020-01-01" },
};

/** Prior-year closing trial balance (31 Dec 2024), entered as opening balances. */
const openingBalances: { code: string; debit: string; credit: string }[] = [
  { code: "1020", debit: "450000000", credit: "0" },
  { code: "1010", debit: "15000000", credit: "0" },
  { code: "1200", debit: "38000000", credit: "0" },
  { code: "1550", debit: "320000000", credit: "0" },
  { code: "1590", debit: "0", credit: "64000000" },
  { code: "2100", debit: "0", credit: "9500000" },
  { code: "2500", debit: "0", credit: "200000000" },
  { code: "3000", debit: "0", credit: "300000000" },
  { code: "3100", debit: "0", credit: "249500000" },
];

const CORPORATES = ["Lekki Conference Centre", "Zenith Towers Admin", "Ikoyi Club Events", "Eko Hotels Procurement", "Shell Staff Welfare"];
const PRIVATE = ["Mrs Okonkwo (wedding)", "Bello family (naming)", "Chukwu birthday", "Adeyemi retirement party", "Church harvest committee", "School PTA"];
const SUPPLIERS = ["Mile 12 Market", "Ogunleye Poultry", "Fresh Farms Ltd", "Sunny Drinks Depot", "Gas Plus"];

const txns: Omit<FixtureTxn, "expected">[] = [];
let n = 0;
const ref = (p: string) => `${p}-${String(++n).padStart(4, "0")}`;
const day = (m: number, d: number) => `2025-${String(m).padStart(2, "0")}-${String(Math.min(d, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 28)).padStart(2, "0")}`;

for (let m = 1; m <= 12; m++) {
  // 15 catering jobs a month, VAT exclusive; corporate customers deduct WHT.
  for (let i = 0; i < 15; i++) {
    const corporate = rand() < 0.35;
    txns.push({
      ref: ref("SAL"),
      date: day(m, between(1, 28)),
      kind: "money_in",
      description: "Catering services",
      amount: naira(150_000, 1_200_000).toString(),
      bankCode: rand() < 0.1 ? "1010" : "1020",
      counterCode: "4000",
      vat: true,
      wht: corporate,
      contact: corporate ? pick(CORPORATES) : pick(PRIVATE),
    });
  }
  // Food and drink purchases (cost of sales, no VAT).
  for (let i = 0; i < 12; i++) {
    txns.push({ ref: ref("PUR"), date: day(m, between(1, 28)), kind: "money_out", description: "Food supplies", amount: naira(150_000, 750_000).toString(), counterCode: "5000", contact: pick(SUPPLIERS) });
  }
  for (let i = 0; i < 2; i++) {
    txns.push({ ref: ref("DSL"), date: day(m, between(1, 28)), kind: "money_out", description: "Diesel for generator", amount: naira(80_000, 220_000).toString(), counterCode: "6120" });
  }
  for (let i = 0; i < 3; i++) {
    txns.push({ ref: ref("FUL"), date: day(m, between(1, 28)), kind: "money_out", description: "Van fuel", amount: naira(20_000, 60_000).toString(), counterCode: "6200", bankCode: "1010" });
  }
  txns.push({ ref: ref("RNT"), date: day(m, 1), kind: "money_out", description: "Kitchen rent", amount: "35000000", counterCode: "6100", contact: "Alhaji Musa (landlord)" });
  txns.push({ ref: ref("SAL"), date: day(m, 28), kind: "money_out", description: "Staff salaries", amount: "250000000", counterCode: "6000" });
  txns.push({ ref: ref("NET"), date: day(m, 5), kind: "money_out", description: "Internet subscription", amount: "2500000", counterCode: "6300", vat: true, contact: "Spectranet" });
  txns.push({ ref: ref("CHG"), date: day(m, 30), kind: "money_out", description: "Bank charges", amount: naira(2_500, 6_000, 50).toString(), counterCode: "6800" });
  txns.push({ ref: ref("TRF"), date: day(m, 3), kind: "transfer", description: "Cash float top-up", amount: "10000000", bankCode: "1020", counterCode: "1010" });
  txns.push({ ref: ref("LDG"), date: day(m, 27), kind: "transfer", description: "Cash takings lodged at bank", amount: "80000000", bankCode: "1010", counterCode: "1020" });
  // Depreciation: straight line on ₦3.2m over 5 years = ₦53,333.33 a month.
  txns.push({ ref: ref("DEP"), date: day(m, 31), kind: "journal", description: "Monthly depreciation", amount: "0", lines: [{ code: "7100", debit: "5333333", credit: "0" }, { code: "1590", debit: "0", credit: "5333333" }] });
  // Remit last month's VAT output (simplified: output only).
  if (m > 1) {
    txns.push({ ref: ref("VAT"), date: day(m, 21), kind: "journal", description: "VAT remittance", amount: "0", lines: [] });
  }
  if (m % 3 === 0) {
    txns.push({ ref: ref("LNR"), date: day(m, 15), kind: "loan_repay", description: "Loan repayment", amount: "31000000", interest: "6000000", interestCode: "8200", counterCode: "2500", contact: "Bank of Industry" });
  }
  if (m % 2 === 0) {
    txns.push({ ref: ref("DRW"), date: day(m, 25), kind: "owner_out", description: "Owner drawings", amount: "15000000", counterCode: "3200" });
  }
  if (m === 6) {
    txns.push({ ref: ref("EQP"), date: day(m, 10), kind: "journal", description: "New industrial oven", amount: "0", lines: [{ code: "1550", debit: "90000000", credit: "0" }, { code: "1020", debit: "0", credit: "90000000" }] });
  }
}

txns.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));

// VAT remittance amounts: last month's VAT output from sales (computed from the legs).
const vatOutputByMonth = new Map<number, bigint>();
for (const t of txns) {
  if (t.kind !== "money_in" || !t.vat) continue;
  const m = Number(t.date.slice(5, 7));
  vatOutputByMonth.set(m, (vatOutputByMonth.get(m) ?? 0n) + roundDiv(BigInt(t.amount) * VAT_BPS, 10_000n));
}
for (const t of txns) {
  if (t.kind === "journal" && t.description === "VAT remittance") {
    const prev = Number(t.date.slice(5, 7)) - 1;
    const due = (vatOutputByMonth.get(prev) ?? 0n).toString();
    t.lines = [
      { code: "2100", debit: due, credit: "0" },
      { code: "1020", debit: "0", credit: due },
    ];
  }
}

const withExpected: FixtureTxn[] = txns.map((t) => ({
  ...t,
  expected: legsFor(t).map(([code, side, amount]) => ({ code, debit: side === "D" ? amount.toString() : "0", credit: side === "C" ? amount.toString() : "0" })),
}));

// ------------------------------------------------------------ expected statements (independent arithmetic)
const ACCOUNT_KIND: Record<string, { type: "asset" | "liability" | "equity" | "income" | "expense"; section: string; name: string }> = {
  "1010": { type: "asset", section: "current_assets", name: "Cash on hand" },
  "1020": { type: "asset", section: "current_assets", name: "GTBank – Current" },
  "1200": { type: "asset", section: "current_assets", name: "Inventory" },
  "1400": { type: "asset", section: "current_assets", name: "VAT input (recoverable)" },
  "1410": { type: "asset", section: "current_assets", name: "WHT receivable (credit notes)" },
  "1550": { type: "asset", section: "non_current_assets", name: "Plant and machinery" },
  "1590": { type: "asset", section: "non_current_assets", name: "Accumulated depreciation" },
  "2100": { type: "liability", section: "current_liabilities", name: "VAT output" },
  "2500": { type: "liability", section: "non_current_liabilities", name: "Long-term loans" },
  "3000": { type: "equity", section: "equity", name: "Owner's capital" },
  "3100": { type: "equity", section: "equity", name: "Retained earnings" },
  "3200": { type: "equity", section: "equity", name: "Drawings" },
  "4000": { type: "income", section: "revenue", name: "Sales" },
  "5000": { type: "expense", section: "cost_of_sales", name: "Cost of sales" },
  "6000": { type: "expense", section: "operating_expenses", name: "Salaries and wages" },
  "6100": { type: "expense", section: "operating_expenses", name: "Rent" },
  "6120": { type: "expense", section: "operating_expenses", name: "Diesel and generator" },
  "6200": { type: "expense", section: "operating_expenses", name: "Fuel and transport" },
  "6300": { type: "expense", section: "operating_expenses", name: "Telephone and internet" },
  "6800": { type: "expense", section: "operating_expenses", name: "Bank charges" },
  "7100": { type: "expense", section: "operating_expenses", name: "Depreciation" },
  "8200": { type: "expense", section: "finance_costs", name: "Interest expense" },
};

const net = new Map<string, bigint>(); // debit − credit
const addNet = (code: string, debit: bigint, credit: bigint) => net.set(code, (net.get(code) ?? 0n) + debit - credit);
for (const ob of openingBalances) addNet(ob.code, BigInt(ob.debit), BigInt(ob.credit));
const plNet = new Map<string, bigint>();
for (const t of withExpected) {
  for (const l of t.expected) {
    if (!ACCOUNT_KIND[l.code]) throw new Error(`Unknown account ${l.code} in ${t.ref}`);
    addNet(l.code, BigInt(l.debit), BigInt(l.credit));
    plNet.set(l.code, (plNet.get(l.code) ?? 0n) + BigInt(l.debit) - BigInt(l.credit));
  }
}

const natural = (code: string, v: bigint) => {
  const k = ACCOUNT_KIND[code];
  return k && (k.type === "asset" || k.type === "expense") ? v : -v;
};
const sectionTotal = (section: string, source: Map<string, bigint>) =>
  Object.entries(ACCOUNT_KIND)
    .filter(([, k]) => k.section === section)
    .reduce((s, [code]) => s + natural(code, source.get(code) ?? 0n), 0n);

const revenue = sectionTotal("revenue", plNet);
const costOfSales = sectionTotal("cost_of_sales", plNet);
const operatingExpenses = sectionTotal("operating_expenses", plNet);
const financeCosts = sectionTotal("finance_costs", plNet);
const grossProfit = revenue - costOfSales;
const operatingProfit = grossProfit - operatingExpenses;
const profitBeforeTax = operatingProfit - financeCosts;

const trialBalance = Object.keys(ACCOUNT_KIND)
  .sort()
  .filter((code) => (net.get(code) ?? 0n) !== 0n)
  .map((code) => {
    const v = net.get(code) ?? 0n;
    return { code, name: ACCOUNT_KIND[code]?.name, debit: (v > 0n ? v : 0n).toString(), credit: (v < 0n ? -v : 0n).toString() };
  });
const tbDebit = trialBalance.reduce((s, r) => s + BigInt(r.debit), 0n);
const tbCredit = trialBalance.reduce((s, r) => s + BigInt(r.credit), 0n);
if (tbDebit !== tbCredit) throw new Error("Generator bug: trial balance does not balance");

const nonCurrentAssets = sectionTotal("non_current_assets", net);
const currentAssets = sectionTotal("current_assets", net);
const equity = sectionTotal("equity", net);
const equityAccounts = ["3000", "3100", "3200"].reduce((s, c) => s + natural(c, net.get(c) ?? 0n), 0n);
const currentLiabilities = sectionTotal("current_liabilities", net);
const nonCurrentLiabilities = sectionTotal("non_current_liabilities", net);
const totalAssets = nonCurrentAssets + currentAssets;
const totalLiabilities = currentLiabilities + nonCurrentLiabilities;
const totalEquity = equityAccounts + profitBeforeTax;
if (totalAssets !== totalLiabilities + totalEquity || equity !== equityAccounts) throw new Error("Generator bug: balance sheet does not balance");

const expected = {
  status: "DRAFT: computed independently of the product; awaiting hand verification by a qualified accountant",
  company: company.legalName,
  trialBalance: { asOf: "2025-12-31", rows: trialBalance, totalDebit: tbDebit.toString(), totalCredit: tbCredit.toString() },
  incomeStatement: {
    from: "2025-01-01",
    to: "2025-12-31",
    revenue: revenue.toString(),
    costOfSales: costOfSales.toString(),
    grossProfit: grossProfit.toString(),
    operatingExpenses: operatingExpenses.toString(),
    operatingProfit: operatingProfit.toString(),
    otherIncome: "0",
    financeCosts: financeCosts.toString(),
    profitBeforeTax: profitBeforeTax.toString(),
    incomeTax: "0",
    profitForPeriod: profitBeforeTax.toString(),
  },
  balanceSheet: {
    asOf: "2025-12-31",
    nonCurrentAssets: nonCurrentAssets.toString(),
    currentAssets: currentAssets.toString(),
    totalAssets: totalAssets.toString(),
    equityAccounts: equityAccounts.toString(),
    priorYearsEarnings: "0",
    currentYearEarnings: profitBeforeTax.toString(),
    totalEquity: totalEquity.toString(),
    currentLiabilities: currentLiabilities.toString(),
    nonCurrentLiabilities: nonCurrentLiabilities.toString(),
    totalLiabilities: totalLiabilities.toString(),
  },
};

const dataset = { company, openingBalances, transactions: withExpected };

const kobo = (v: string) => {
  const b = BigInt(v);
  return `${b / 100n}.${String(b % 100n).padStart(2, "0")}`;
};
const csv = [
  "ref,date,kind,description,contact,account,debit_ngn,credit_ngn",
  ...withExpected.flatMap((t) => t.expected.map((l) => [t.ref, t.date, t.kind, t.description, t.contact ?? "", `${l.code} ${ACCOUNT_KIND[l.code]?.name ?? ""}`, kobo(l.debit), kobo(l.credit)].map((x) => `"${x}"`).join(","))),
].join("\n");
const tbCsv = ["code,account,debit_ngn,credit_ngn", ...trialBalance.map((r) => [r.code, r.name ?? "", kobo(r.debit), kobo(r.credit)].map((x) => `"${x}"`).join(",")), `"","Total","${kobo(tbDebit.toString())}","${kobo(tbCredit.toString())}"`].join("\n");

writeFileSync(`${OUT}/dataset.json`, `${JSON.stringify(dataset, null, 1)}\n`);
writeFileSync(`${OUT}/expected.json`, `${JSON.stringify(expected, null, 2)}\n`);
writeFileSync(`${OUT}/transactions.csv`, `${csv}\n`);
writeFileSync(`${OUT}/expected-tb.csv`, `${tbCsv}\n`);
console.log(`Wrote ${withExpected.length} transactions; profit for 2025: ₦${kobo(profitBeforeTax.toString())}`);
