import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { creditLine, debitLine, fiscalYearContaining, monthlyPeriods, trialEndsAt } from "@kedge/core";
import { withUser, type AuthClaims, type Database } from "../client";
import { insertPostedEntry } from "../repositories/posting";
import {
  accounts,
  auditLog,
  bankAccounts,
  contacts,
  entities,
  entityAccess,
  fiscalYears,
  invitations,
  memberships,
  organisations,
  periods,
  taxCodes,
  transactions,
  userEntityPrefs,
} from "../schema";

export interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly claims: AuthClaims;
}

/** Inserts a user into the (shimmed) auth.users table; a trigger mirrors it into public.users. */
export async function createAuthUser(db: Database, label = "user"): Promise<TestUser> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@example.test`;
  await db.execute(
    sql`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values (${id}, ${email}, ${JSON.stringify({ full_name: label })}::jsonb, now())`,
  );
  return { id, email, claims: { sub: id, email } };
}

/** Creates an org through RLS exactly as sign-up does: org, owner membership, audit row. */
export async function createOrgAs(db: Database, owner: TestUser, name: string, kind: "firm" | "business" = "firm"): Promise<string> {
  const orgId = randomUUID();
  await withUser(db, owner.claims, async (tx) => {
    await tx.insert(organisations).values({ id: orgId, name, kind, createdBy: owner.id, trialEndsAt: trialEndsAt(new Date()) });
    await tx.insert(memberships).values({ orgId, userId: owner.id, role: "org_owner" });
    await tx.insert(auditLog).values({ orgId, actorUserId: owner.id, action: "organisation.create", targetType: "organisation", targetId: orgId });
  });
  return orgId;
}

export async function createEntityAs(db: Database, user: TestUser, orgId: string, legalName: string): Promise<string> {
  const entityId = randomUUID();
  await withUser(db, user.claims, async (tx) => {
    await tx.insert(entities).values({ id: entityId, orgId, legalName });
    await tx.insert(auditLog).values({ orgId, entityId, actorUserId: user.id, action: "entity.create", targetType: "entity", targetId: entityId });
  });
  return entityId;
}

export interface SeededTenant {
  readonly orgId: string;
  readonly entityId: string;
  readonly owner: TestUser;
  readonly accountant: TestUser;
  readonly viewer: TestUser;
  readonly invitationId: string;
  readonly ledger: SeededLedger;
}

export interface SeededLedger {
  readonly fiscalYearId: string;
  readonly periodIds: readonly string[];
  readonly accounts: { readonly bank: string; readonly sales: string; readonly rent: string; readonly vatOutput: string; readonly header: string; readonly obe: string };
  readonly bankAccountId: string;
  readonly contactId: string;
  readonly taxCodeId: string;
  readonly entryId: string;
  readonly transactionId: string;
}

/** Ledger set-up used by tests: a fiscal year of open periods, a few accounts and one posted transaction. */
export async function seedLedger(db: Database, owner: TestUser, orgId: string, entityId: string, today = "2026-03-15"): Promise<SeededLedger> {
  const fy = fiscalYearContaining(today, 1);
  const fiscalYearId = randomUUID();
  const ids = { bank: randomUUID(), sales: randomUUID(), rent: randomUUID(), vatOutput: randomUUID(), header: randomUUID(), obe: randomUUID() };
  const bankAccountId = randomUUID();
  const contactId = randomUUID();
  const taxCodeId = randomUUID();
  const transactionId = randomUUID();
  const periodRows = monthlyPeriods(fy).map((p) => ({ id: randomUUID(), orgId, entityId, fiscalYearId, ...p }));

  const entryId = await withUser(db, owner.claims, async (tx) => {
    await tx.insert(fiscalYears).values({ id: fiscalYearId, orgId, entityId, ...fy });
    await tx.insert(periods).values(periodRows);
    const t = { orgId, entityId };
    await tx.insert(accounts).values([
      { ...t, id: ids.header, code: "1000", name: "Cash and bank", type: "asset", subtype: "current_asset", normalBalance: "debit", cashFlowCategory: "cash" },
      { ...t, id: ids.bank, code: "1020", name: "Main bank", type: "asset", subtype: "bank", normalBalance: "debit", cashFlowCategory: "cash", parentId: ids.header },
      { ...t, id: ids.vatOutput, code: "2100", name: "VAT output", type: "liability", subtype: "tax_payable", normalBalance: "credit", cashFlowCategory: "operating_working_capital", systemKey: "vat_output" },
      { ...t, id: ids.obe, code: "3900", name: "Opening balance equity", type: "equity", subtype: "equity_capital", normalBalance: "credit", cashFlowCategory: "none", systemKey: "opening_balance_equity" },
      { ...t, id: ids.sales, code: "4000", name: "Sales", type: "income", subtype: "revenue", normalBalance: "credit" },
      { ...t, id: ids.rent, code: "6100", name: "Rent", type: "expense", subtype: "operating_expense", normalBalance: "debit" },
    ]);
    await tx.insert(bankAccounts).values({ ...t, id: bankAccountId, ledgerAccountId: ids.bank, bankName: "Test Bank", accountName: "Main", kind: "current", accountNumberMasked: "•••• 1234" });
    await tx.insert(contacts).values({ ...t, id: contactId, kind: "customer", name: "Test Customer" });
    await tx.insert(taxCodes).values({
      ...t,
      id: taxCodeId,
      codeKey: "VAT_STANDARD",
      kind: "vat",
      name: "VAT standard (test)",
      rateBps: 750,
      effectiveFrom: "2020-02-01",
      appliesTo: "both",
      recoverable: true,
      outputAccountId: ids.vatOutput,
    });
    await tx.insert(transactions).values({
      ...t,
      id: transactionId,
      kind: "money_in",
      txnDate: today,
      amount: 107_500n,
      bankAccountId,
      counterAccountId: ids.sales,
      contactId,
      taxCodeId,
      amountsIncludeTax: true,
      createdBy: owner.id,
    });
    const posted = await insertPostedEntry(tx, {
      orgId,
      entityId,
      userId: owner.id,
      idempotencyKey: randomUUID(),
      now: new Date(),
      draft: {
        entryDate: today,
        memo: "Money in",
        sourceType: "transaction",
        sourceId: transactionId,
        lines: [debitLine(ids.bank, 107_500n, { contactId }), creditLine(ids.sales, 100_000n, { taxCodeId }), creditLine(ids.vatOutput, 7_500n, { taxCodeId })],
      },
    });
    await tx.update(transactions).set({ status: "posted", journalEntryId: posted.id }).where(sql`id = ${transactionId}`);
    return posted.id;
  });

  return { fiscalYearId, periodIds: periodRows.map((p) => p.id), accounts: ids, bankAccountId, contactId, taxCodeId, entryId, transactionId };
}

/**
 * Creates one org with a row in every tenant table, all written through RLS
 * by the org's own users.
 */
export async function seedTenant(db: Database, label: string): Promise<SeededTenant> {
  const owner = await createAuthUser(db, `${label}-owner`);
  const accountant = await createAuthUser(db, `${label}-accountant`);
  const viewer = await createAuthUser(db, `${label}-viewer`);
  const orgId = await createOrgAs(db, owner, `${label} Org`);
  const entityId = await createEntityAs(db, owner, orgId, `${label} Ltd`);
  const invitationId = randomUUID();

  await withUser(db, owner.claims, async (tx) => {
    await tx.insert(memberships).values({ orgId, userId: accountant.id, role: "accountant" });
    await tx.insert(entityAccess).values([
      { orgId, entityId, userId: accountant.id, role: "accountant", grantedBy: owner.id },
      { orgId, entityId, userId: viewer.id, role: "viewer", grantedBy: owner.id },
    ]);
    await tx.insert(userEntityPrefs).values({ orgId, entityId, userId: owner.id, displayMode: "accountant" });
    await tx.insert(invitations).values({
      id: invitationId,
      orgId,
      entityId,
      email: `${label}-invitee@example.test`.toLowerCase(),
      role: "client_owner",
      tokenHash: randomUUID().replace(/-/g, ""),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      invitedBy: owner.id,
    });
  });

  const ledger = await seedLedger(db, owner, orgId, entityId);
  return { orgId, entityId, owner, accountant, viewer, invitationId, ledger };
}
