/**
 * AC-1.8: the golden dataset "Adaeze Catering Ltd" (12 months, ~490
 * transactions) produces a trial balance, P&L and balance sheet that match
 * the expected figures to the kobo.
 *
 * The expected figures are computed by an independent generator
 * (packages/db/fixtures/adaeze-catering/generate.ts) and are still a DRAFT
 * awaiting hand verification. Never "fix" this test by editing them unless
 * they are demonstrably wrong (CLAUDE.md).
 */
import type { Account, BankAccount, Contact, EntityDetail, JournalDetail, OrganisationContext, ReportResponse, TaxCodeDto, Transaction } from "@kedge/api";
import { loadAdaezeCatering } from "@kedge/db/fixtures/adaeze-catering";
import { createAuthUser, type TestUser } from "@kedge/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endpoints } from "../api/endpoints";
import { body, createHarness, type Harness } from "./helpers";

const { dataset, expected } = loadAdaezeCatering();

let h: Harness;
let owner: TestUser;
let entityId: string;
const accountByCode = new Map<string, Account>();
const postedEntries = new Map<string, string>(); // fixture ref → journal entry id
const NOW = new Date("2026-01-15T09:00:00Z");

beforeAll(async () => {
  h = createHarness();
  owner = await createAuthUser(h.handle.db, "golden");
  const call: Harness["call"] = (def, opts) => h.call(def, { claims: owner.claims, now: NOW, ...opts });
  const ok = <T>(r: Awaited<ReturnType<Harness["call"]>>): T => {
    if (r.status >= 300) throw new Error(`API ${r.status}: ${JSON.stringify(r.body)}`);
    return r.body as T;
  };

  const org = ok<OrganisationContext>(await call(endpoints.createOrganisation, { body: { name: "Adaeze Holdings", kind: "business" } }));
  const entity = ok<EntityDetail>(await call(endpoints.createEntityWithBooks, { params: { orgId: org.organisation.id }, body: dataset.company }));
  entityId = entity.id;
  for (const a of ok<{ accounts: Account[] }>(await call(endpoints.listAccounts, { params: { entityId } })).accounts) accountByCode.set(a.code, a);
  const id = (code: string) => {
    const a = accountByCode.get(code);
    if (!a) throw new Error(`No account ${code}`);
    return a.id;
  };

  const banks = ok<{ bankAccounts: BankAccount[] }>(await call(endpoints.listBankAccounts, { params: { entityId } })).bankAccounts;
  const bankByLedger = new Map(banks.map((b) => [b.ledgerAccountId, b.id]));
  const bankId = (code: string) => bankByLedger.get(id(code)) as string;

  const vat = ok<{ taxCodes: TaxCodeDto[] }>(await call(endpoints.listTaxCodes, { params: { entityId } })).taxCodes.find((t) => t.codeKey === "VAT_STANDARD") as TaxCodeDto;
  const wht = ok<TaxCodeDto>(
    await call(endpoints.createTaxCode, { params: { entityId }, body: { ...dataset.company.whtCode, kind: "wht", appliesTo: "both", recoverable: false } }),
  );

  ok(
    await call(endpoints.postOpeningBalances, {
      params: { entityId },
      idempotencyKey: "golden-opening-balances",
      body: { balances: dataset.openingBalances.map((b) => ({ accountId: id(b.code), debit: b.debit, credit: b.credit })) },
    }),
  );

  const contacts = new Map<string, string>();
  for (const name of new Set(dataset.transactions.map((t) => t.contact).filter((c): c is string => Boolean(c)))) {
    contacts.set(name, ok<Contact>(await call(endpoints.createContact, { params: { entityId }, body: { kind: "other", name } })).id);
  }

  for (const t of dataset.transactions) {
    const idempotencyKey = `golden-${t.ref}`;
    if (t.kind === "journal") {
      const je = ok<JournalDetail>(
        await call(endpoints.createJournal, {
          params: { entityId },
          idempotencyKey,
          body: { entryDate: t.date, memo: `${t.ref} ${t.description}`, post: true, lines: (t.lines ?? []).map((l) => ({ accountId: id(l.code), debit: l.debit, credit: l.credit })) },
        }),
      );
      postedEntries.set(t.ref, je.id);
      continue;
    }
    const txn = ok<Transaction>(
      await call(endpoints.createTransaction, {
        params: { entityId },
        idempotencyKey,
        body: {
          kind: t.kind,
          txnDate: t.date,
          amount: t.amount,
          bankAccountId: bankId(t.bankCode ?? "1020"),
          counterAccountId: id(t.counterCode as string),
          contactId: t.contact ? (contacts.get(t.contact) ?? null) : null,
          taxCodeId: t.vat ? vat.id : null,
          whtCodeId: t.wht ? wht.id : null,
          interestAmount: t.interest ?? null,
          interestAccountId: t.interestCode ? id(t.interestCode) : null,
          reference: t.ref,
        },
      }),
    );
    postedEntries.set(t.ref, txn.journalEntryId as string);
  }
}, 300_000);

afterAll(async () => {
  await h.handle.close();
});

const report = async <K extends ReportResponse["report"]>(query: Record<string, string>) =>
  body<Extract<ReportResponse, { report: K }>>(await h.call(endpoints.runReport, { claims: owner.claims, now: NOW, params: { entityId }, query }));

describe(`golden dataset: ${dataset.company.legalName} (${expected.status.split(":")[0]})`, () => {
  it(`loads all ${dataset.transactions.length} transactions`, () => {
    expect(postedEntries.size).toBe(dataset.transactions.length);
  });

  it("every transaction posts exactly the expected debits and credits", async () => {
    const codeOf = new Map([...accountByCode.values()].map((a) => [a.id, a.code]));
    const mismatches: string[] = [];
    for (const t of dataset.transactions) {
      const je = body<JournalDetail>(await h.call(endpoints.getJournal, { claims: owner.claims, now: NOW, params: { entryId: postedEntries.get(t.ref) as string } }));
      const actual = je.lines.map((l) => `${codeOf.get(l.accountId)} ${l.debit}/${l.credit}`).sort();
      const want = t.expected.map((l) => `${l.code} ${l.debit}/${l.credit}`).sort();
      if (JSON.stringify(actual) !== JSON.stringify(want)) mismatches.push(`${t.ref}: got ${actual.join(", ")}; expected ${want.join(", ")}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("trial balance at 31 December 2025 matches to the kobo", async () => {
    const tb = await report<"trial-balance">({ report: "trial-balance", asOf: expected.trialBalance.asOf });
    expect(tb.rows.map((r) => ({ code: r.account.code, debit: r.debit, credit: r.credit }))).toEqual(expected.trialBalance.rows.map(({ code, debit, credit }) => ({ code, debit, credit })));
    expect([tb.totalDebit, tb.totalCredit]).toEqual([expected.trialBalance.totalDebit, expected.trialBalance.totalCredit]);
    expect(tb.checks.every((c) => c.passed)).toBe(true);
  });

  it("income statement for 2025 matches to the kobo", async () => {
    const pl = await report<"income-statement">({ report: "income-statement", from: "2025-01-01", to: "2025-12-31" });
    const e = expected.incomeStatement;
    expect({
      revenue: pl.revenue.total,
      costOfSales: pl.costOfSales.total,
      grossProfit: pl.grossProfit.amount,
      operatingExpenses: pl.operatingExpenses.total,
      operatingProfit: pl.operatingProfit.amount,
      otherIncome: pl.otherIncome.total,
      financeCosts: pl.financeCosts.total,
      profitBeforeTax: pl.profitBeforeTax.amount,
      incomeTax: pl.incomeTax.total,
      profitForPeriod: pl.profitForPeriod.amount,
    }).toEqual({
      revenue: e.revenue,
      costOfSales: e.costOfSales,
      grossProfit: e.grossProfit,
      operatingExpenses: e.operatingExpenses,
      operatingProfit: e.operatingProfit,
      otherIncome: e.otherIncome,
      financeCosts: e.financeCosts,
      profitBeforeTax: e.profitBeforeTax,
      incomeTax: e.incomeTax,
      profitForPeriod: e.profitForPeriod,
    });
  });

  it("balance sheet at 31 December 2025 matches to the kobo and balances", async () => {
    const bs = await report<"balance-sheet">({ report: "balance-sheet", asOf: "2025-12-31" });
    const e = expected.balanceSheet;
    expect({
      nonCurrentAssets: bs.nonCurrentAssets.total,
      currentAssets: bs.currentAssets.total,
      totalAssets: bs.totalAssets.amount,
      equityAccounts: bs.equity.total,
      priorYearsEarnings: bs.priorYearsEarnings.amount,
      currentYearEarnings: bs.currentYearEarnings.amount,
      totalEquity: bs.totalEquity.amount,
      currentLiabilities: bs.currentLiabilities.total,
      nonCurrentLiabilities: bs.nonCurrentLiabilities.total,
      totalLiabilities: bs.totalLiabilities.amount,
    }).toEqual({ ...e, asOf: undefined });
    expect(bs.checks.every((c) => c.passed)).toBe(true);
  });
});
