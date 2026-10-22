/**
 * AC-0.4, API half: a user with no grant on org B cannot read or change
 * anything in org B through /api/v1. Every endpoint that takes an ID is
 * listed below; a new endpoint fails this test until it is covered.
 */
import type { MeResponse } from "@kedge/api";
import { seedTenant, type SeededTenant } from "@kedge/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endpoints } from "../api/endpoints";
import type { Endpoint } from "../api/endpoint";
import { body, createHarness, type Harness } from "./helpers";

let h: Harness;
let a: SeededTenant;
let b: SeededTenant;

beforeAll(async () => {
  h = createHarness();
  a = await seedTenant(h.handle.db, "api-alpha");
  b = await seedTenant(h.handle.db, "api-bravo");
});

afterAll(async () => {
  await h.handle.close();
});

type AnyEndpoint = Endpoint<string, unknown, unknown>;

/** For each endpoint that takes IDs: org B's IDs, and a valid body if one is needed. */
const targetsInOrgB: Record<string, () => { params: Record<string, string>; body?: unknown; query?: Record<string, string>; idempotencyKey?: string }> = {
  getOrganisation: () => ({ params: { orgId: b.orgId } }),
  updateOrganisation: () => ({ params: { orgId: b.orgId }, body: { name: "Hijacked" } }),
  listMembers: () => ({ params: { orgId: b.orgId } }),
  createEntity: () => ({ params: { orgId: b.orgId }, body: { legalName: "Hijack Ltd" } }),
  updateEntityPreferences: () => ({ params: { entityId: b.entityId }, body: { displayMode: "simple" } }),
  invitationOptions: () => ({ params: { orgId: b.orgId } }),
  listInvitations: () => ({ params: { orgId: b.orgId } }),
  createInvitation: () => ({ params: { orgId: b.orgId }, body: { email: "x@example.test", role: "org_admin" } }),
  revokeInvitation: () => ({ params: { invitationId: b.invitationId } }),
  createEntityWithBooks: () => ({
    params: { orgId: b.orgId },
    body: { legalName: "Hijack Ltd", vatRegistered: false, fiscalYearStartMonth: 1, goLiveDate: "2026-01-01", coaTemplate: "service" },
  }),
  getEntity: () => ({ params: { entityId: b.entityId } }),
  setUpEntityBooks: () => ({
    params: { entityId: b.entityId },
    body: { legalName: "Hijack Ltd", vatRegistered: false, fiscalYearStartMonth: 1, goLiveDate: "2026-01-01", coaTemplate: "service" },
  }),
  getDashboard: () => ({ params: { entityId: b.entityId } }),
  listPracticeClients: () => ({ params: { orgId: b.orgId } }),
  listAccounts: () => ({ params: { entityId: b.entityId } }),
  createAccount: () => ({ params: { entityId: b.entityId }, body: { code: "6990", name: "Hijack", subtype: "operating_expense" } }),
  updateAccount: () => ({ params: { accountId: b.ledger.accounts.rent }, body: { name: "Hijacked" } }),
  listJournals: () => ({ params: { entityId: b.entityId } }),
  createJournal: () => ({ params: { entityId: b.entityId }, body: { entryDate: "2026-03-10", lines: [] } }),
  getJournal: () => ({ params: { entryId: b.ledger.entryId } }),
  updateJournalDraft: () => ({ params: { entryId: b.ledger.entryId }, body: { entryDate: "2026-03-10", lines: [] } }),
  deleteJournalDraft: () => ({ params: { entryId: b.ledger.entryId } }),
  postJournal: () => ({ params: { entryId: b.ledger.entryId }, idempotencyKey: "isolation-test-key" }),
  reverseJournal: () => ({ params: { entryId: b.ledger.entryId }, body: { reason: "hijack" }, idempotencyKey: "isolation-test-key" }),
  listPeriods: () => ({ params: { entityId: b.entityId } }),
  addFiscalYear: () => ({ params: { entityId: b.entityId } }),
  lockPeriod: () => ({ params: { periodId: b.ledger.periodIds[0] as string }, body: {} }),
  unlockPeriod: () => ({ params: { periodId: b.ledger.periodIds[0] as string }, body: { reason: "hijack" } }),
  listTransactions: () => ({ params: { entityId: b.entityId } }),
  createTransaction: () => ({
    params: { entityId: b.entityId },
    body: { kind: "money_out", txnDate: "2026-03-10", amount: "100", bankAccountId: b.ledger.bankAccountId, counterAccountId: b.ledger.accounts.rent, post: false },
  }),
  getTransaction: () => ({ params: { transactionId: b.ledger.transactionId } }),
  postTransaction: () => ({ params: { transactionId: b.ledger.transactionId }, idempotencyKey: "isolation-test-key" }),
  reverseTransaction: () => ({ params: { transactionId: b.ledger.transactionId }, body: { reason: "hijack" }, idempotencyKey: "isolation-test-key" }),
  listContacts: () => ({ params: { entityId: b.entityId } }),
  createContact: () => ({ params: { entityId: b.entityId }, body: { kind: "customer", name: "Hijack" } }),
  updateContact: () => ({ params: { contactId: b.ledger.contactId }, body: { kind: "customer", name: "Hijacked" } }),
  listTaxCodes: () => ({ params: { entityId: b.entityId } }),
  createTaxCode: () => ({
    params: { entityId: b.entityId },
    body: { codeKey: "WHT_HIJACK", kind: "wht", name: "x", rateBps: 500, effectiveFrom: "2026-01-01", appliesTo: "both" },
  }),
  listBankAccounts: () => ({ params: { entityId: b.entityId } }),
  createBankAccount: () => ({ params: { entityId: b.entityId }, body: { bankName: "X", accountName: "Y", kind: "current" } }),
  postOpeningBalances: () => ({ params: { entityId: b.entityId }, body: { balances: [{ accountId: b.ledger.accounts.bank, debit: "1" }] }, idempotencyKey: "isolation-test-key" }),
  runReport: () => ({ params: { entityId: b.entityId }, query: { report: "trial-balance" } }),
  listAudit: () => ({ params: { entityId: b.entityId } }),
  exportReport: () => ({ params: { entityId: b.entityId }, query: { report: "trial-balance", format: "csv" } }),
};

describe("API tenant isolation", () => {
  it("covers every endpoint that takes an ID", () => {
    const withParams = Object.entries(endpoints)
      .filter(([, def]) => ((def as AnyEndpoint).params ?? []).length > 0)
      .map(([name]) => name)
      .sort();
    expect(Object.keys(targetsInOrgB).sort()).toEqual(withParams);
  });

  for (const name of Object.keys(targetsInOrgB)) {
    it(`${name}: org A's owner gets 404 for org B`, async () => {
      const def = endpoints[name as keyof typeof endpoints] as AnyEndpoint;
      const target = targetsInOrgB[name]?.();
      const res = await h.call(def, { claims: a.owner.claims, params: target?.params ?? {}, body: target?.body, query: target?.query ?? {}, idempotencyKey: target?.idempotencyKey ?? "" });
      expect(res.status).toBe(404);
    });
  }

  it("/me lists only the caller's organisations", async () => {
    const res = await h.call(endpoints.getMe, { claims: a.owner.claims });
    expect(res.status).toBe(200);
    expect(body<MeResponse>(res).organisations.map((o) => o.id)).toEqual([a.orgId]);
  });

  it("an assigned viewer of org A cannot reach org B either", async () => {
    const res = await h.call(endpoints.getOrganisation, { claims: a.viewer.claims, params: { orgId: b.orgId } });
    expect(res.status).toBe(404);
  });

  it("malformed IDs are treated as not found", async () => {
    const res = await h.call(endpoints.getOrganisation, { claims: a.owner.claims, params: { orgId: "../../etc" } });
    expect(res.status).toBe(404);
  });

  it("requests without a verified session are rejected", async () => {
    for (const [name, def] of Object.entries(endpoints)) {
      if ((def as AnyEndpoint).auth === "public") continue;
      const res = await h.call(def as AnyEndpoint, {
        claims: null,
        params: {
          orgId: a.orgId,
          entityId: a.entityId,
          invitationId: a.invitationId,
          accountId: a.ledger.accounts.rent,
          entryId: a.ledger.entryId,
          periodId: a.ledger.periodIds[0] as string,
          transactionId: a.ledger.transactionId,
          contactId: a.ledger.contactId,
        },
      });
      expect({ name, status: res.status }).toEqual({ name, status: 401 });
    }
  });
});
