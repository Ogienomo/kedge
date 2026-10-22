/**
 * Phase 1 acceptance criteria through /api/v1 with a real database:
 * AC-1.1 (domain layer), AC-1.3, AC-1.4, AC-1.5, AC-1.6 (via the API),
 * AC-1.9, plus onboarding set-up and opening balances.
 */
import type { Account, BankAccount, EntityDetail, FiscalYear, JournalDetail, OrganisationContext, ReportResponse, TaxCodeDto, Transaction } from "@kedge/api";
import { createAuthUser, type TestUser } from "@kedge/db/testing";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endpoints } from "../api/endpoints";
import { body, createHarness, type Harness } from "./helpers";

let h: Harness;
let owner: TestUser;
let orgId: string;
let entity: EntityDetail;
let accounts: Account[];
let banks: BankAccount[];
let vat: TaxCodeDto;

const NOW = new Date("2026-03-15T10:00:00Z");
const key = () => `test-${randomUUID()}`;
const acct = (code: string) => {
  const a = accounts.find((x) => x.code === code);
  if (!a) throw new Error(`no account ${code}`);
  return a;
};

beforeAll(async () => {
  h = createHarness();
  owner = await createAuthUser(h.handle.db, "ledger-owner");
  const org = body<OrganisationContext>(await h.call(endpoints.createOrganisation, { claims: owner.claims, body: { name: "Adaeze Group", kind: "business" }, now: NOW }));
  orgId = org.organisation.id;
  const res = await h.call(endpoints.createEntityWithBooks, {
    claims: owner.claims,
    now: NOW,
    params: { orgId },
    body: {
      legalName: "Adaeze Catering Ltd",
      tradingName: "Adaeze Kitchen",
      vatRegistered: true,
      fiscalYearStartMonth: 1,
      goLiveDate: "2026-01-01",
      coaTemplate: "general_sme",
      bankAccounts: [
        { bankName: "GTBank", accountName: "Current", accountNumber: "0123456789", kind: "current" },
        { bankName: "Moniepoint", accountName: "POS", kind: "wallet" },
      ],
    },
  });
  expect(res.status).toBe(201);
  entity = body<EntityDetail>(res);
  accounts = body<{ accounts: Account[] }>(await h.call(endpoints.listAccounts, { claims: owner.claims, params: { entityId: entity.id }, now: NOW })).accounts;
  banks = body<{ bankAccounts: BankAccount[] }>(await h.call(endpoints.listBankAccounts, { claims: owner.claims, params: { entityId: entity.id }, now: NOW })).bankAccounts;
  const taxes = body<{ taxCodes: TaxCodeDto[] }>(await h.call(endpoints.listTaxCodes, { claims: owner.claims, params: { entityId: entity.id } })).taxCodes;
  vat = taxes.find((t) => t.codeKey === "VAT_STANDARD") as TaxCodeDto;
});

afterAll(async () => {
  await h.handle.close();
});

const call: Harness["call"] = (def, opts) => h.call(def, { claims: owner.claims, now: NOW, ...opts });

async function post(lines: { accountId: string; debit?: string; credit?: string }[], opts: { date?: string; idem?: string } = {}) {
  return call(endpoints.createJournal, { params: { entityId: entity.id }, body: { entryDate: opts.date ?? "2026-03-10", memo: "test", lines, post: true }, idempotencyKey: opts.idem ?? key() });
}

async function trialBalance(asOf = "2026-12-31") {
  const r = body<Extract<ReportResponse, { report: "trial-balance" }>>(await call(endpoints.runReport, { params: { entityId: entity.id }, query: { report: "trial-balance", asOf } }));
  return { ...r, byCode: new Map(r.rows.map((x) => [x.account.code, BigInt(x.debit) - BigInt(x.credit)])) };
}

describe("onboarding set-up (SPEC §6.2)", () => {
  it("creates the chart of accounts, fiscal years, periods, VAT codes and bank accounts", async () => {
    expect(entity.booksReady).toBe(true);
    expect(entity.goLiveDate).toBe("2026-01-01");
    expect(accounts.some((a) => a.systemKey === "opening_balance_equity")).toBe(true);
    const periods = body<{ fiscalYears: FiscalYear[] }>(await call(endpoints.listPeriods, { params: { entityId: entity.id } })).fiscalYears;
    // The opening balance date (31 Dec 2025) needs the 2025 year; plus 2026 and 2027.
    expect(periods.map((y) => y.startDate)).toEqual(["2025-01-01", "2026-01-01", "2027-01-01"]);
    expect(periods.every((y) => y.periods.length === 12 && y.periods.every((p) => p.status === "open"))).toBe(true);
    expect(vat).toMatchObject({ rateBps: 750, verified: false });
    expect(banks.map((b) => [b.bankName, b.kind, b.accountNumberMasked])).toEqual([
      ["Cash", "cash", null],
      ["GTBank", "current", "•••• 6789"],
      ["Moniepoint", "wallet", null],
    ]);
  });

  it("stores bank account numbers only encrypted, never in plain text or the audit log", async () => {
    const rows = await h.handle.db.execute<{ enc: string | null }>(sql`select account_number_encrypted as enc from bank_accounts where entity_id = ${entity.id} and bank_name = 'GTBank'`);
    expect(rows[0]?.enc).toMatch(/^v1:/);
    const leaks = await h.handle.db.execute<{ n: number }>(sql`
      select (select count(*) from audit_log where (before::text || after::text) like '%0123456789%')::int
           + (select count(*) from bank_accounts where account_number_encrypted like '%0123456789%')::int as n`);
    expect(leaks[0]?.n).toBe(0);
  });

  it("cannot be run twice", async () => {
    const res = await call(endpoints.setUpEntityBooks, {
      params: { entityId: entity.id },
      body: { legalName: "x", vatRegistered: false, fiscalYearStartMonth: 1, goLiveDate: "2026-01-01", coaTemplate: "service" },
    });
    expect(res.status).toBe(409);
  });
});

describe("opening balances (SPEC §4.8)", () => {
  it("post the day before go-live and leave opening balance equity at zero when complete", async () => {
    const gtb = banks.find((b) => b.bankName === "GTBank") as BankAccount;
    const res = await call(endpoints.postOpeningBalances, {
      params: { entityId: entity.id },
      idempotencyKey: key(),
      body: {
        balances: [
          { accountId: gtb.ledgerAccountId, debit: "250000000" },
          { accountId: acct("1520").id, debit: "100000000" },
          { accountId: acct("2500").id, credit: "150000000" },
          { accountId: acct("3000").id, credit: "200000000" },
        ],
      },
    });
    expect(res.status).toBe(201);
    const detail = body<EntityDetail>(await call(endpoints.getEntity, { params: { entityId: entity.id } }));
    expect(detail.setup.openingBalanceEquity).toBe("0");
    expect(detail.setup.openingBalancesDone).toBe(true);
    const tb = await trialBalance("2025-12-31");
    expect(tb.byCode.get(gtb ? acct("1020").code : "")).toBe(250_000_000n);
  });
});

describe("AC-1.6 through the API: quick add compiles via the posting map", () => {
  it("money in, VAT inclusive: Dr Bank 10,750; Cr Sales 10,000; Cr VAT output 750", async () => {
    const res = await call(endpoints.createTransaction, {
      params: { entityId: entity.id },
      idempotencyKey: key(),
      body: {
        kind: "money_in",
        txnDate: "2026-03-02",
        amount: "1075000",
        bankAccountId: (banks.find((b) => b.bankName === "GTBank") as BankAccount).id,
        counterAccountId: acct("4000").id,
        taxCodeId: vat.id,
        amountsIncludeTax: true,
        reference: "INV-001",
      },
    });
    expect(res.status).toBe(201);
    const txn = body<Transaction>(res);
    expect(txn.status).toBe("posted");
    expect(txn.breakdown).toEqual({ net: "1000000", vat: "75000", wht: "0", bank: "1075000" });
    const je = body<JournalDetail>(await call(endpoints.getJournal, { params: { entryId: txn.journalEntryId as string } }));
    expect(je.lines.map((l) => [l.accountCode, l.debit, l.credit])).toEqual([
      ["1020", "1075000", "0"],
      ["4000", "0", "1000000"],
      ["2100", "0", "75000"],
    ]);
  });
});

describe("AC-1.1 (domain layer): unbalanced entries are rejected and nothing is written", () => {
  it("returns 422 unbalanced_entry", async () => {
    const before = await h.handle.db.execute<{ n: number }>(sql`select count(*)::int as n from journal_entries where entity_id = ${entity.id}`);
    const res = await post([
      { accountId: acct("6100").id, debit: "1000" },
      { accountId: acct("1010").id, credit: "999" },
    ]);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { code: "unbalanced_entry" } });
    const after = await h.handle.db.execute<{ n: number }>(sql`select count(*)::int as n from journal_entries where entity_id = ${entity.id}`);
    expect(after[0]?.n).toBe(before[0]?.n);
  });

  it("refuses header accounts and requires an idempotency key to post", async () => {
    expect((await post([{ accountId: acct("1000").id, debit: "5" }, { accountId: acct("1010").id, credit: "5" }])).body).toMatchObject({ error: { code: "account_not_postable" } });
    const noKey = await call(endpoints.createJournal, { params: { entityId: entity.id }, body: { entryDate: "2026-03-10", lines: [], post: true } });
    expect(noKey.status).toBe(422);
  });
});

describe("AC-1.3: reversal mirrors the entry, links both ways and nets every account to zero", () => {
  it("reverses a posted entry", async () => {
    const lines = [
      { accountId: acct("6100").id, debit: "500000" },
      { accountId: acct("1400").id, debit: "37500" },
      { accountId: acct("1010").id, credit: "537500" },
    ];
    const before = await trialBalance();
    const original = body<JournalDetail>(await post(lines, { date: "2026-03-12" }));
    const res = await call(endpoints.reverseJournal, { params: { entryId: original.id }, idempotencyKey: key(), body: { reason: "Wrong account" } });
    expect(res.status).toBe(201);
    const reversal = body<JournalDetail>(res);
    expect(reversal.sourceType).toBe("reversal");
    expect(reversal.reversesEntryId).toBe(original.id);
    expect(reversal.entryDate).toBe("2026-03-12");
    expect(reversal.reversalReason).toBe("Wrong account");
    expect(reversal.lines.map((l) => [l.accountCode, l.debit, l.credit])).toEqual(original.lines.map((l) => [l.accountCode, l.credit, l.debit]));
    const reread = body<JournalDetail>(await call(endpoints.getJournal, { params: { entryId: original.id } }));
    expect(reread.reversedByEntryId).toBe(reversal.id);

    const after = await trialBalance();
    for (const code of ["6100", "1400", "1010"]) expect(after.byCode.get(code) ?? 0n).toBe(before.byCode.get(code) ?? 0n);

    const again = await call(endpoints.reverseJournal, { params: { entryId: original.id }, idempotencyKey: key(), body: { reason: "Twice" } });
    expect(again.body).toMatchObject({ error: { code: "already_reversed" } });
    const noReason = await call(endpoints.reverseJournal, { params: { entryId: reversal.id }, idempotencyKey: key(), body: { reason: "" } });
    expect(noReason.status).toBe(422);
  });
});

describe("AC-1.4: period locks", () => {
  it("blocks posting into a locked period; unlocking needs the permission and a reason, and is audited", async () => {
    const years = body<{ fiscalYears: FiscalYear[] }>(await call(endpoints.listPeriods, { params: { entityId: entity.id } })).fiscalYears;
    const feb = years[1]?.periods[1];
    if (!feb) throw new Error("no Feb period");

    expect((await call(endpoints.lockPeriod, { params: { periodId: feb.id }, body: { reason: "February closed" } })).status).toBe(200);
    const blocked = await post([{ accountId: acct("6100").id, debit: "100" }, { accountId: acct("1010").id, credit: "100" }], { date: "2026-02-14" });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ error: { code: "period_locked" } });

    // A reversal of a February entry would be dated in March, the first open date.
    expect((await call(endpoints.unlockPeriod, { params: { periodId: feb.id }, body: { reason: "  " } })).status).toBe(422);

    const bk = await createAuthUser(h.handle.db, "bk");
    await h.handle.db.execute(sql`insert into memberships (org_id, user_id, role) values (${orgId}, ${bk.id}, 'bookkeeper')`);
    await h.handle.db.execute(sql`insert into entity_access (org_id, entity_id, user_id, role) values (${orgId}, ${entity.id}, ${bk.id}, 'bookkeeper')`);
    const denied = await h.call(endpoints.unlockPeriod, { claims: bk.claims, now: NOW, params: { periodId: feb.id }, body: { reason: "please" } });
    expect(denied.status).toBe(403);

    expect((await call(endpoints.unlockPeriod, { params: { periodId: feb.id }, body: { reason: "Late supplier invoice" } })).status).toBe(200);
    expect((await post([{ accountId: acct("6100").id, debit: "100" }, { accountId: acct("1010").id, credit: "100" }], { date: "2026-02-14" })).status).toBe(201);

    const audit = await h.handle.db.execute<{ action: string; reason: string | null }>(sql`select action, reason from audit_log where target_id = ${feb.id} order by at`);
    expect(audit.map((a) => [a.action, a.reason])).toEqual([
      ["period.lock", "February closed"],
      ["period.unlock", "Late supplier invoice"],
    ]);
  });
});

describe("AC-1.5: gapless, unique journal numbers under concurrency", () => {
  it("50 parallel posts get 50 consecutive numbers", async () => {
    const numbersBefore = await h.handle.db.execute<{ number: string }>(sql`select number from journal_entries where entity_id = ${entity.id} and status = 'posted' and number like 'JE-2026-%'`);
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => post([{ accountId: acct("6400").id, debit: String(100 + i) }, { accountId: acct("1010").id, credit: String(100 + i) }], { date: "2026-03-20" })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const all = await h.handle.db.execute<{ number: string }>(sql`select number from journal_entries where entity_id = ${entity.id} and status = 'posted' and number like 'JE-2026-%' order by number`);
    expect(all.length).toBe(numbersBefore.length + 50);
    all.forEach((r, i) => expect(r.number).toBe(`JE-2026-${String(i + 1).padStart(6, "0")}`));
  });
});

describe("AC-1.9: idempotent posting", () => {
  it("replaying a manual journal post returns the same entry and creates nothing", async () => {
    const idem = key();
    const lines = [
      { accountId: acct("6300").id, debit: "4200" },
      { accountId: acct("1010").id, credit: "4200" },
    ];
    const first = body<JournalDetail>(await post(lines, { idem }));
    const count = async () => (await h.handle.db.execute<{ n: number }>(sql`select count(*)::int as n from journal_entries where entity_id = ${entity.id}`))[0]?.n;
    const n = await count();
    const second = body<JournalDetail>(await post(lines, { idem }));
    const [a, b] = await Promise.all([post(lines, { idem }), post(lines, { idem })]);
    expect(second.id).toBe(first.id);
    expect(second.number).toBe(first.number);
    expect(body<JournalDetail>(a).id).toBe(first.id);
    expect(body<JournalDetail>(b).id).toBe(first.id);
    expect(await count()).toBe(n);
  });

  it("replaying a quick-add transaction returns the same transaction", async () => {
    const idem = key();
    const input = {
      kind: "money_out" as const,
      txnDate: "2026-03-05",
      amount: "250000",
      bankAccountId: (banks.find((b) => b.bankName === "GTBank") as BankAccount).id,
      counterAccountId: acct("6200").id,
    };
    const first = body<Transaction>(await call(endpoints.createTransaction, { params: { entityId: entity.id }, body: input, idempotencyKey: idem }));
    const second = body<Transaction>(await call(endpoints.createTransaction, { params: { entityId: entity.id }, body: input, idempotencyKey: idem }));
    expect(second.id).toBe(first.id);
    expect(second.journalEntryId).toBe(first.journalEntryId);
  });
});

describe("reports", () => {
  it("trial balance balances; balance sheet satisfies the accounting equation", async () => {
    const tb = await trialBalance();
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.checks.every((c) => c.passed)).toBe(true);
    const bs = body<Extract<ReportResponse, { report: "balance-sheet" }>>(await call(endpoints.runReport, { params: { entityId: entity.id }, query: { report: "balance-sheet", asOf: "2026-03-31", compare: "previous_year" } }));
    expect(bs.checks.every((c) => c.passed)).toBe(true);
    expect(BigInt(bs.totalAssets.amount)).toBe(BigInt(bs.totalLiabilities.amount) + BigInt(bs.totalEquity.amount));
    const pl = body<Extract<ReportResponse, { report: "income-statement" }>>(
      await call(endpoints.runReport, { params: { entityId: entity.id }, query: { report: "income-statement", from: "2026-01-01", to: "2026-03-31" } }),
    );
    expect(pl.revenue.total).toBe("1000000");
  });
});

describe("transaction permissions (SPEC §3.3)", () => {
  it("client staff record drafts but cannot post; viewers cannot record", async () => {
    const staff = await createAuthUser(h.handle.db, "staff");
    const viewer = await createAuthUser(h.handle.db, "viewer");
    await h.handle.db.execute(sql`insert into entity_access (org_id, entity_id, user_id, role) values (${orgId}, ${entity.id}, ${staff.id}, 'client_staff'), (${orgId}, ${entity.id}, ${viewer.id}, 'viewer')`);
    const input = { kind: "money_out", txnDate: "2026-03-06", amount: "1000", bankAccountId: (banks[0] as BankAccount).id, counterAccountId: acct("6400").id };
    const draft = await h.call(endpoints.createTransaction, { claims: staff.claims, now: NOW, params: { entityId: entity.id }, body: { ...input, post: false } });
    expect(draft.status).toBe(201);
    const posted = await h.call(endpoints.postTransaction, { claims: staff.claims, now: NOW, params: { transactionId: body<Transaction>(draft).id }, idempotencyKey: key() });
    expect(posted.status).toBe(403);
    expect((await h.call(endpoints.createTransaction, { claims: viewer.claims, now: NOW, params: { entityId: entity.id }, body: { ...input, post: false } })).status).toBe(403);
  });
});
