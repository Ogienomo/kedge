import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PeriodInfo } from "../periods/periods";
import { typeOfSubtype, type AccountSubtype, type LedgerAccount } from "./accounts";
import { buildReversal, creditLine, debitLine, validateForPosting, type EntryDraft, type PostedEntry } from "./entry";
import { buildOpeningBalanceEntry } from "./opening-balances";

function acc(id: string, subtype: AccountSubtype, extra: Partial<LedgerAccount> = {}): LedgerAccount {
  return { id, code: id, name: id, type: typeOfSubtype(subtype), subtype, isLeaf: true, isActive: true, systemKey: null, ...extra };
}

const accounts = new Map(
  [
    acc("bank", "bank"),
    acc("sales", "revenue"),
    acc("rent", "operating_expense"),
    acc("old", "operating_expense", { isActive: false }),
    acc("header", "operating_expense", { isLeaf: false }),
    acc("capital", "equity_capital"),
    acc("obe", "equity_capital", { systemKey: "opening_balance_equity" }),
    acc("loan", "non_current_liability"),
  ].map((a) => [a.id, a]),
);
const open: PeriodInfo = { id: "p", startDate: "2026-03-01", endDate: "2026-03-31", status: "open" };
const ctx = { accounts, period: open };

function draft(lines: EntryDraft["lines"], date = "2026-03-10"): EntryDraft {
  return { entryDate: date, memo: "test", sourceType: "manual", lines };
}

describe("validateForPosting (AC-1.1, domain layer)", () => {
  it("accepts a balanced entry on active leaf accounts in an open period", () => {
    expect(() => validateForPosting(draft([debitLine("rent", 100n), creditLine("bank", 100n)]), ctx)).not.toThrow();
  });

  it("rejects an unbalanced entry with a typed error carrying the totals", () => {
    expect(() => validateForPosting(draft([debitLine("rent", 100n), creditLine("bank", 99n)]), ctx)).toThrowError(
      expect.objectContaining({ code: "unbalanced_entry", totalDebit: 100n, totalCredit: 99n }),
    );
  });

  it.each([
    ["one line", [debitLine("rent", 0n)]],
    ["zero line", [debitLine("rent", 0n), creditLine("bank", 0n)]],
    ["both sides", [{ accountId: "rent", debit: 5n, credit: 5n }, creditLine("bank", 0n)]],
    ["negative", [{ accountId: "rent", debit: -5n, credit: 0n }, { accountId: "bank", debit: 0n, credit: -5n }]],
  ])("rejects %s (rule 2)", (_name, lines) => {
    expect(() => validateForPosting(draft(lines), ctx)).toThrowError(expect.objectContaining({ code: "invalid_entry" }));
  });

  it.each([
    ["inactive", "old"],
    ["not_leaf", "header"],
    ["unknown", "missing"],
  ])("rejects %s accounts", (reason, id) => {
    expect(() => validateForPosting(draft([debitLine(id, 10n), creditLine("bank", 10n)]), ctx)).toThrowError(
      expect.objectContaining({ code: "account_not_postable", reason }),
    );
  });

  it("rejects dates outside the period and locked periods", () => {
    expect(() => validateForPosting(draft([debitLine("rent", 1n), creditLine("bank", 1n)], "2026-04-01"), ctx)).toThrowError(
      expect.objectContaining({ code: "period_not_found" }),
    );
    expect(() => validateForPosting(draft([debitLine("rent", 1n), creditLine("bank", 1n)]), { accounts, period: { ...open, status: "locked" } })).toThrowError(
      expect.objectContaining({ code: "period_locked" }),
    );
  });

  it("property: any entry whose sides differ is rejected; any balanced one accepted", () => {
    const ids = ["bank", "sales", "rent", "capital", "loan"];
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.constantFrom(...ids), amount: fc.bigInt({ min: 1n, max: 10n ** 12n }), debit: fc.boolean() }), { minLength: 1, maxLength: 8 }),
        (raw) => {
          const lines = raw.map((r) => (r.debit ? debitLine(r.id, r.amount) : creditLine(r.id, r.amount)));
          const diff = raw.reduce((s, r) => s + (r.debit ? r.amount : -r.amount), 0n);
          const balanced = [...lines, ...(diff > 0n ? [creditLine("bank", diff)] : diff < 0n ? [debitLine("bank", -diff)] : [])];
          // The balanced version always posts (it has ≥ 2 lines unless all netted to one).
          if (balanced.length >= 2) validateForPosting(draft(balanced), ctx);
          // Any perturbation of one amount by k ≠ 0 must be rejected.
          const broken = balanced.map((l, i) => (i === 0 ? (l.debit > 0n ? { ...l, debit: l.debit + 1n } : { ...l, credit: l.credit + 1n }) : l));
          try {
            validateForPosting(draft(broken), ctx);
            return false;
          } catch (e) {
            return (e as { code?: string }).code === "unbalanced_entry" || (e as { code?: string }).code === "invalid_entry";
          }
        },
      ),
    );
  });
});

describe("reversal (rule 3)", () => {
  const original: PostedEntry = {
    id: "e1",
    number: "JE-2026-000001",
    entryDate: "2026-03-10",
    memo: "Rent",
    reversedByEntryId: null,
    sourceType: "manual",
    lines: [debitLine("rent", 100n, { description: "March" }), creditLine("bank", 100n)],
  };

  it("swaps every line and links back to the original", () => {
    const r = buildReversal(original, "Wrong amount", "2026-03-10");
    expect(r.sourceType).toBe("reversal");
    expect(r.sourceId).toBe("e1");
    expect(r.memo).toBe("Reversal of JE-2026-000001: Wrong amount");
    expect(r.lines).toEqual([creditLine("rent", 100n, { description: "March" }), debitLine("bank", 100n)]);
  });

  it("requires a reason, refuses double reversal and reversing a reversal", () => {
    expect(() => buildReversal(original, " ", "2026-03-10")).toThrowError(expect.objectContaining({ code: "reason_required" }));
    expect(() => buildReversal({ ...original, reversedByEntryId: "e2" }, "x", "2026-03-10")).toThrowError(expect.objectContaining({ code: "already_reversed" }));
    expect(() => buildReversal({ ...original, sourceType: "reversal" }, "x", "2026-03-10")).toThrowError(expect.objectContaining({ code: "invalid_entry" }));
  });
});

describe("opening balances (SPEC §4.8)", () => {
  it("posts the day before go-live and balances to opening balance equity", () => {
    const entry = buildOpeningBalanceEntry({
      goLiveDate: "2026-01-01",
      openingBalanceEquityAccountId: "obe",
      accounts,
      balances: [
        { accountId: "bank", debit: 500_000n, credit: 0n },
        { accountId: "loan", debit: 0n, credit: 200_000n },
        { accountId: "capital", debit: 0n, credit: 0n },
      ],
    });
    expect(entry.entryDate).toBe("2025-12-31");
    expect(entry.sourceType).toBe("opening_balance");
    expect(entry.lines).toEqual([debitLine("bank", 500_000n), creditLine("loan", 200_000n), creditLine("obe", 300_000n, { description: "Balancing figure" })]);
  });

  it("rejects income/expense accounts and direct OBE entries", () => {
    const base = { goLiveDate: "2026-01-01", openingBalanceEquityAccountId: "obe", accounts };
    expect(() => buildOpeningBalanceEntry({ ...base, balances: [{ accountId: "sales", debit: 0n, credit: 5n }] })).toThrowError(/balance sheet/);
    expect(() => buildOpeningBalanceEntry({ ...base, balances: [{ accountId: "obe", debit: 5n, credit: 0n }] })).toThrowError(/calculated/);
  });
});
