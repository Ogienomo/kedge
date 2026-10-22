import type { BankAccount, BankAccountInput, Contact, ContactInput, CreateTaxCodeRequest, OpeningBalancesRequest, TaxCodeDto } from "@kedge/api";
import { bankAccountInputSchema, contactInputSchema, createTaxCodeRequestSchema, openingBalancesRequestSchema } from "@kedge/api";
import { addDays, assertCan, buildOpeningBalanceEntry, ConflictError, NotFoundError, parseMinor } from "@kedge/core";
import { schema, withUser, type Tx } from "@kedge/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { writeAudit } from "../../audit";
import { requireClaims, type ServiceContext } from "../../context";
import { idempotent, postDraft } from "./posting";
import { accountMap, entityScope, systemAccountId } from "./scope";
import { createBankAccountWithLedger } from "./setup";

// ------------------------------------------------------------------ contacts

type ContactRow = typeof schema.contacts.$inferSelect;
const toContact = (c: ContactRow): Contact => ({ id: c.id, kind: c.kind, name: c.name, email: c.email, phone: c.phone, tin: c.tin, address: c.address, isActive: c.isActive });

export async function listContacts(ctx: ServiceContext, entityId: string, q: { search?: string } = {}): Promise<{ contacts: Contact[] }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    await entityScope(tx, claims, entityId, ctx.now);
    const rows = await tx
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.entityId, entityId), q.search ? sql`${schema.contacts.name} ilike ${"%" + q.search.replace(/[%_\\]/g, "\\$&") + "%"}` : undefined))
      .orderBy(asc(schema.contacts.name));
    return { contacts: rows.map(toContact) };
  });
}

export async function createContact(ctx: ServiceContext, entityId: string, raw: ContactInput): Promise<Contact> {
  const claims = requireClaims(ctx);
  const input = contactInputSchema.parse(raw);
  return withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    assertCan(scope.actor, "transaction.create", entityId, ctx.now);
    const id = crypto.randomUUID();
    const values = { id, orgId: scope.orgId, entityId, ...input, email: input.email ?? null, phone: input.phone ?? null, tin: input.tin ?? null, address: input.address ?? null };
    await tx.insert(schema.contacts).values(values);
    await writeAudit(tx, ctx, claims.sub, { orgId: scope.orgId, entityId, action: "contact.create", targetType: "contact", targetId: id, after: { kind: input.kind, name: input.name } });
    return toContact({ ...values, isActive: true, createdAt: ctx.now, updatedAt: ctx.now });
  });
}

export async function updateContact(ctx: ServiceContext, contactId: string, raw: ContactInput & { isActive?: boolean }): Promise<Contact> {
  const claims = requireClaims(ctx);
  const input = contactInputSchema.parse(raw);
  return withUser(ctx.db, claims, async (tx) => {
    const [before] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    if (!before) throw new NotFoundError("Contact");
    const scope = await entityScope(tx, claims, before.entityId, ctx.now);
    assertCan(scope.actor, "transaction.create", before.entityId, ctx.now);
    const set = { ...input, email: input.email ?? null, phone: input.phone ?? null, tin: input.tin ?? null, address: input.address ?? null, ...(typeof raw.isActive === "boolean" ? { isActive: raw.isActive } : {}) };
    await tx.update(schema.contacts).set(set).where(eq(schema.contacts.id, contactId));
    await writeAudit(tx, ctx, claims.sub, { orgId: scope.orgId, entityId: before.entityId, action: "contact.update", targetType: "contact", targetId: contactId, before: toContact(before), after: set });
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    if (!row) throw new NotFoundError("Contact");
    return toContact(row);
  });
}

// ------------------------------------------------------------------ tax codes

type TaxRow = typeof schema.taxCodes.$inferSelect;
const toTaxDto = (t: TaxRow): TaxCodeDto => ({
  id: t.id,
  codeKey: t.codeKey,
  kind: t.kind,
  name: t.name,
  rateBps: t.rateBps,
  effectiveFrom: t.effectiveFrom,
  effectiveTo: t.effectiveTo,
  appliesTo: t.appliesTo,
  recoverable: t.recoverable,
  verified: t.verifiedBy !== null,
});

export async function listTaxCodes(ctx: ServiceContext, entityId: string): Promise<{ taxCodes: TaxCodeDto[] }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    await entityScope(tx, claims, entityId, ctx.now);
    const rows = await tx.select().from(schema.taxCodes).where(eq(schema.taxCodes.entityId, entityId)).orderBy(asc(schema.taxCodes.kind), asc(schema.taxCodes.codeKey), asc(schema.taxCodes.effectiveFrom));
    return { taxCodes: rows.map(toTaxDto) };
  });
}

/**
 * Adds a tax code version (rule 10: rates are data). A new version of an
 * existing code ends the previous version the day before it starts.
 */
export async function createTaxCodeVersion(ctx: ServiceContext, entityId: string, raw: CreateTaxCodeRequest): Promise<TaxCodeDto> {
  const claims = requireClaims(ctx);
  const input = createTaxCodeRequestSchema.parse(raw);
  return withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    assertCan(scope.actor, "entity.settings.edit", entityId, ctx.now);
    const [latest] = await tx
      .select()
      .from(schema.taxCodes)
      .where(and(eq(schema.taxCodes.entityId, entityId), eq(schema.taxCodes.codeKey, input.codeKey)))
      .orderBy(desc(schema.taxCodes.effectiveFrom))
      .limit(1);
    if (latest) {
      if (latest.kind !== input.kind) throw new ConflictError(`${input.codeKey} is a ${latest.kind.toUpperCase()} code`);
      if (input.effectiveFrom <= latest.effectiveFrom) throw new ConflictError("A new version must start after the current one");
      await tx.update(schema.taxCodes).set({ effectiveTo: addDays(input.effectiveFrom, -1) }).where(eq(schema.taxCodes.id, latest.id));
    }
    const output = input.kind === "vat" ? await systemAccountId(tx, entityId, "vat_output") : await systemAccountId(tx, entityId, "wht_payable");
    const inputAcc = input.kind === "vat" ? await systemAccountId(tx, entityId, "vat_input") : await systemAccountId(tx, entityId, "wht_receivable");
    const id = crypto.randomUUID();
    const values = { id, orgId: scope.orgId, entityId, ...input, outputAccountId: output, inputAccountId: inputAcc };
    await tx.insert(schema.taxCodes).values(values);
    await writeAudit(tx, ctx, claims.sub, { orgId: scope.orgId, entityId, action: "tax_code.create", targetType: "tax_code", targetId: id, after: input });
    const [row] = await tx.select().from(schema.taxCodes).where(eq(schema.taxCodes.id, id));
    if (!row) throw new NotFoundError("Tax code");
    return toTaxDto(row);
  });
}

// ------------------------------------------------------------------ bank accounts

async function bankAccounts(tx: Tx, entityId: string, asOf: string): Promise<BankAccount[]> {
  const rows = await tx.execute<{
    id: string;
    ledger_account_id: string;
    bank_name: string;
    account_name: string;
    account_number_masked: string | null;
    kind: BankAccount["kind"];
    currency: string;
    is_active: boolean;
    balance: string;
  }>(sql`
    select b.id, b.ledger_account_id, b.bank_name, b.account_name, b.account_number_masked, b.kind, b.currency, b.is_active,
           coalesce((select sum(l.debit) - sum(l.credit) from journal_lines l
                       join journal_entries e on e.id = l.entry_id and e.status = 'posted' and e.entry_date <= ${asOf}
                      where l.account_id = b.ledger_account_id), 0)::text as balance
      from bank_accounts b
      join accounts a on a.id = b.ledger_account_id
     where b.entity_id = ${entityId}
     order by a.code
  `);
  return rows.map((r) => ({
    id: r.id,
    ledgerAccountId: r.ledger_account_id,
    bankName: r.bank_name,
    accountName: r.account_name,
    accountNumberMasked: r.account_number_masked,
    kind: r.kind,
    currency: r.currency,
    isActive: r.is_active,
    balance: r.balance,
  }));
}

export async function listBankAccounts(ctx: ServiceContext, entityId: string): Promise<{ bankAccounts: BankAccount[] }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    return { bankAccounts: await bankAccounts(tx, entityId, scope.today) };
  });
}

export async function createBankAccount(ctx: ServiceContext, entityId: string, raw: BankAccountInput): Promise<{ bankAccounts: BankAccount[] }> {
  const claims = requireClaims(ctx);
  const input = bankAccountInputSchema.parse(raw);
  return withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    assertCan(scope.actor, "coa.edit", entityId, ctx.now);
    const id = await createBankAccountWithLedger(tx, ctx, scope, input);
    // Never audit the account number itself.
    await writeAudit(tx, ctx, claims.sub, { orgId: scope.orgId, entityId, action: "bank_account.create", targetType: "bank_account", targetId: id, after: { bankName: input.bankName, accountName: input.accountName, kind: input.kind } });
    return { bankAccounts: await bankAccounts(tx, entityId, scope.today) };
  });
}

// ------------------------------------------------------------------ opening balances

/** SPEC §4.8 manual entry: one opening_balance entry dated the day before go-live. */
export async function postOpeningBalances(ctx: ServiceContext, entityId: string, raw: OpeningBalancesRequest, idempotencyKey: string): Promise<{ entryId: string; number: string }> {
  const claims = requireClaims(ctx);
  const input = openingBalancesRequestSchema.parse(raw);
  return idempotent(() =>
    withUser(ctx.db, claims, async (tx) => {
      const scope = await entityScope(tx, claims, entityId, ctx.now);
      assertCan(scope.actor, "journal.manual.post", entityId, ctx.now);
      if (!scope.entity.goLiveDate) throw new ConflictError("Set up the books first");
      const draft = buildOpeningBalanceEntry({
        goLiveDate: scope.entity.goLiveDate,
        accounts: await accountMap(tx, entityId),
        openingBalanceEquityAccountId: await systemAccountId(tx, entityId, "opening_balance_equity"),
        balances: input.balances.map((b) => ({ accountId: b.accountId, debit: parseMinor(b.debit), credit: parseMinor(b.credit) })),
      });
      const posted = await postDraft(tx, ctx, scope, draft, idempotencyKey);
      return { entryId: posted.id, number: posted.number };
    }),
  );
}
