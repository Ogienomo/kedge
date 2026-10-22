/** AC-1.6: every row of the SPEC §4.4 posting map produces the documented debits and credits. */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { TaxCode } from "../tax/tax-codes";
import type { AccountSubtype, LedgerAccount } from "./accounts";
import { typeOfSubtype } from "./accounts";
import { entryTotals, validateForPosting } from "./entry";
import { compileTransaction, type TransactionInput } from "./posting-map";

function acc(id: string, subtype: AccountSubtype): LedgerAccount {
  return { id, code: id, name: id, type: typeOfSubtype(subtype), subtype, isLeaf: true, isActive: true, systemKey: null };
}

const ACCOUNTS = new Map(
  [
    acc("bank", "bank"),
    acc("cash", "cash"),
    acc("sales", "revenue"),
    acc("fuel", "operating_expense"),
    acc("vat_output", "tax_payable"),
    acc("vat_input", "current_asset"),
    acc("wht_receivable", "current_asset"),
    acc("wht_payable", "tax_payable"),
    acc("capital", "equity_capital"),
    acc("drawings", "drawings"),
    acc("loan", "non_current_liability"),
    acc("interest", "finance_cost"),
  ].map((a) => [a.id, a]),
);

const DATE = "2026-03-15";

const VAT: TaxCode = {
  id: "vat-std",
  codeKey: "VAT_STANDARD",
  kind: "vat",
  name: "VAT standard",
  rateBps: 750,
  effectiveFrom: "2020-02-01",
  effectiveTo: null,
  appliesTo: "both",
  recoverable: true,
  outputAccountId: "vat_output",
  inputAccountId: "vat_input",
};
const VAT_NON_RECOVERABLE: TaxCode = { ...VAT, id: "vat-nr", recoverable: false };
const VAT_ZERO: TaxCode = { ...VAT, id: "vat-zero", codeKey: "VAT_ZERO", rateBps: 0 };
/** Test rate only: WHT rates are data and must be verified before launch (SPEC §4.7). */
const WHT: TaxCode = {
  id: "wht-test",
  codeKey: "WHT_TEST",
  kind: "wht",
  name: "WHT test rate",
  rateBps: 500,
  effectiveFrom: "2020-01-01",
  effectiveTo: null,
  appliesTo: "both",
  recoverable: false,
  outputAccountId: "wht_payable",
  inputAccountId: "wht_receivable",
};

/** Lines as { account: "D 123" | "C 123" } for exact comparison. */
function legs(input: Partial<TransactionInput> & Pick<TransactionInput, "kind" | "amount" | "counterAccountId">) {
  const { draft, breakdown } = compileTransaction({ txnDate: DATE, bankAccountId: "bank", ...input }, ACCOUNTS);
  const t = entryTotals(draft.lines);
  expect(t.debit).toBe(t.credit);
  return { legs: draft.lines.map((l) => [l.accountId, l.debit > 0n ? `D ${l.debit}` : `C ${l.credit}`]), breakdown, draft };
}

describe("posting map (SPEC §4.4)", () => {
  it("money in: Dr Bank, Cr Income", () => {
    expect(legs({ kind: "money_in", amount: 500_000n, counterAccountId: "sales" }).legs).toEqual([
      ["bank", "D 500000"],
      ["sales", "C 500000"],
    ]);
  });

  it("money in with VAT (exclusive): Dr Bank gross; Cr Income net, Cr VAT output", () => {
    expect(legs({ kind: "money_in", amount: 1_000_000n, counterAccountId: "sales", vat: VAT }).legs).toEqual([
      ["bank", "D 1075000"],
      ["sales", "C 1000000"],
      ["vat_output", "C 75000"],
    ]);
  });

  it("money in with VAT-inclusive amount splits net = round(gross × 10000 / 10750)", () => {
    const r = legs({ kind: "money_in", amount: 1_075_000n, counterAccountId: "sales", vat: VAT, amountsIncludeTax: true });
    expect(r.legs).toEqual([
      ["bank", "D 1075000"],
      ["sales", "C 1000000"],
      ["vat_output", "C 75000"],
    ]);
    // A gross that does not divide evenly: 1,000.00 → net 930.23, VAT 69.77.
    expect(legs({ kind: "money_in", amount: 100_000n, counterAccountId: "sales", vat: VAT, amountsIncludeTax: true }).legs).toEqual([
      ["bank", "D 100000"],
      ["sales", "C 93023"],
      ["vat_output", "C 6977"],
    ]);
  });

  it("money in, customer deducted WHT: Dr Bank (net received), Dr WHT receivable; Cr Income (gross), Cr VAT output", () => {
    const r = legs({ kind: "money_in", amount: 1_000_000n, counterAccountId: "sales", vat: VAT, wht: WHT });
    // WHT 5% of the amount excluding VAT = 50,000; bank = 1,075,000 − 50,000.
    expect(r.legs).toEqual([
      ["bank", "D 1025000"],
      ["wht_receivable", "D 50000"],
      ["sales", "C 1000000"],
      ["vat_output", "C 75000"],
    ]);
    expect(r.breakdown).toEqual({ net: 1_000_000n, vat: 75_000n, wht: 50_000n, bank: 1_025_000n });
  });

  it("money out: Dr Expense (net), Dr VAT input (recoverable); Cr Bank", () => {
    expect(legs({ kind: "money_out", amount: 200_000n, counterAccountId: "fuel", vat: VAT }).legs).toEqual([
      ["fuel", "D 200000"],
      ["vat_input", "D 15000"],
      ["bank", "C 215000"],
    ]);
  });

  it("money out with non-recoverable VAT puts the VAT into the expense", () => {
    expect(legs({ kind: "money_out", amount: 200_000n, counterAccountId: "fuel", vat: VAT_NON_RECOVERABLE }).legs).toEqual([
      ["fuel", "D 215000"],
      ["bank", "C 215000"],
    ]);
  });

  it("money out, we deducted WHT: Dr Expense (gross); Cr Bank (net paid), Cr WHT payable", () => {
    expect(legs({ kind: "money_out", amount: 400_000n, counterAccountId: "fuel", wht: WHT }).legs).toEqual([
      ["fuel", "D 400000"],
      ["bank", "C 380000"],
      ["wht_payable", "C 20000"],
    ]);
  });

  it("a 0% VAT code creates no zero line", () => {
    expect(legs({ kind: "money_in", amount: 300_000n, counterAccountId: "sales", vat: VAT_ZERO }).legs).toEqual([
      ["bank", "D 300000"],
      ["sales", "C 300000"],
    ]);
  });

  it("transfer: Dr destination bank, Cr source bank", () => {
    expect(legs({ kind: "transfer", amount: 50_000n, counterAccountId: "cash" }).legs).toEqual([
      ["cash", "D 50000"],
      ["bank", "C 50000"],
    ]);
  });

  it("owner puts money in: Dr Bank, Cr Owner's capital", () => {
    expect(legs({ kind: "owner_in", amount: 5_000_000n, counterAccountId: "capital" }).legs).toEqual([
      ["bank", "D 5000000"],
      ["capital", "C 5000000"],
    ]);
  });

  it("owner takes money out: Dr Drawings, Cr Bank", () => {
    expect(legs({ kind: "owner_out", amount: 120_000n, counterAccountId: "drawings" }).legs).toEqual([
      ["drawings", "D 120000"],
      ["bank", "C 120000"],
    ]);
  });

  it("loan received: Dr Bank, Cr Loan liability", () => {
    expect(legs({ kind: "loan_in", amount: 10_000_000n, counterAccountId: "loan" }).legs).toEqual([
      ["bank", "D 10000000"],
      ["loan", "C 10000000"],
    ]);
  });

  it("loan repayment: Dr Loan (principal), Dr Finance cost (interest); Cr Bank", () => {
    expect(legs({ kind: "loan_repay", amount: 1_100_000n, interest: 100_000n, interestAccountId: "interest", counterAccountId: "loan" }).legs).toEqual([
      ["loan", "D 1000000"],
      ["interest", "D 100000"],
      ["bank", "C 1100000"],
    ]);
  });
});

describe("posting map guards", () => {
  const base = { txnDate: DATE, bankAccountId: "bank" } as const;

  it.each([
    [{ kind: "money_in", amount: 1n, counterAccountId: "fuel" }, "an income category"],
    [{ kind: "money_out", amount: 1n, counterAccountId: "sales" }, "an expense category"],
    [{ kind: "owner_in", amount: 1n, counterAccountId: "drawings" }, "owner's capital"],
    [{ kind: "owner_out", amount: 1n, counterAccountId: "capital" }, "drawings"],
    [{ kind: "loan_in", amount: 1n, counterAccountId: "sales" }, "a loan account"],
    [{ kind: "transfer", amount: 1n, counterAccountId: "bank" }, "two different accounts"],
    [{ kind: "transfer", amount: 1n, counterAccountId: "vat_input" }, "a bank or cash account"],
    [{ kind: "money_in", amount: 0n, counterAccountId: "sales" }, "greater than zero"],
    [{ kind: "transfer", amount: 1n, counterAccountId: "cash", vat: VAT }, "only apply to money in and money out"],
    [{ kind: "money_in", amount: 100n, counterAccountId: "sales", vat: WHT }, "is not a VAT code"],
    [{ kind: "money_in", amount: 100n, counterAccountId: "sales", vat: { ...VAT, effectiveFrom: "2027-01-01" } }, "not in force"],
    [{ kind: "loan_repay", amount: 100n, interest: 200n, interestAccountId: "interest", counterAccountId: "loan" }, "Interest must be"],
  ] as const)("rejects %o", (input, message) => {
    expect(() => compileTransaction({ ...base, ...(input as Omit<TransactionInput, "txnDate" | "bankAccountId">) }, ACCOUNTS)).toThrowError(
      expect.objectContaining({ code: "invalid_transaction", message: expect.stringContaining(message) }),
    );
  });

  it("every compiled transaction is a valid, balanced, postable entry", () => {
    const kinds = fc.constantFrom(
      { kind: "money_in" as const, counterAccountId: "sales" },
      { kind: "money_out" as const, counterAccountId: "fuel" },
      { kind: "transfer" as const, counterAccountId: "cash" },
      { kind: "owner_in" as const, counterAccountId: "capital" },
      { kind: "owner_out" as const, counterAccountId: "drawings" },
      { kind: "loan_in" as const, counterAccountId: "loan" },
    );
    fc.assert(
      fc.property(kinds, fc.bigInt({ min: 100n, max: 10n ** 12n }), fc.boolean(), fc.boolean(), fc.boolean(), (k, amount, useVat, useWht, inclusive) => {
        const taxed = k.kind === "money_in" || k.kind === "money_out";
        const { draft, breakdown } = compileTransaction(
          { ...base, ...k, amount, vat: taxed && useVat ? VAT : null, wht: taxed && useWht ? WHT : null, amountsIncludeTax: inclusive },
          ACCOUNTS,
        );
        validateForPosting(draft, { accounts: ACCOUNTS, period: { id: "p", startDate: "2026-03-01", endDate: "2026-03-31", status: "open" } });
        return breakdown.bank === breakdown.net + breakdown.vat - breakdown.wht;
      }),
    );
  });
});
