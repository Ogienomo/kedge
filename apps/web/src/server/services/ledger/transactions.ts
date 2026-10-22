import type { ReverseRequest, Transaction, TransactionInput } from "@kedge/api";
import { reverseRequestSchema, transactionInputSchema } from "@kedge/api";
import {
  assertCan,
  compileTransaction,
  ConflictError,
  NotFoundError,
  parseMinor,
  taxBreakdown,
  ValidationError,
  type TaxCode,
} from "@kedge/core";
import { findByIdempotencyKey, schema, withUser, type Tx } from "@kedge/db";
import { aliasedTable, and, eq, sql } from "drizzle-orm";
import { writeAudit } from "../../audit";
import { requireClaims, type ServiceContext } from "../../context";
import { reverseEntryInTx } from "./journals";
import { idempotent, postDraft } from "./posting";
import { accountMap, entityScope, type EntityScope } from "./scope";

type TxnRow = typeof schema.transactions.$inferSelect;
type TaxRow = typeof schema.taxCodes.$inferSelect;

export function toTaxCode(r: TaxRow): TaxCode {
  return {
    id: r.id,
    codeKey: r.codeKey,
    kind: r.kind,
    name: r.name,
    rateBps: r.rateBps,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    appliesTo: r.appliesTo,
    recoverable: r.recoverable,
    outputAccountId: r.outputAccountId,
    inputAccountId: r.inputAccountId,
  };
}

async function taxCode(tx: Tx, entityId: string, id: string | null): Promise<TaxCode | null> {
  if (!id) return null;
  const [row] = await tx.select().from(schema.taxCodes).where(and(eq(schema.taxCodes.id, id), eq(schema.taxCodes.entityId, entityId)));
  if (!row) throw new NotFoundError("Tax code");
  return toTaxCode(row);
}

/** Compiles a stored transaction through the posting map (rule 12). */
async function compile(tx: Tx, row: TxnRow) {
  const [bank] = await tx.select({ ledgerAccountId: schema.bankAccounts.ledgerAccountId }).from(schema.bankAccounts).where(eq(schema.bankAccounts.id, row.bankAccountId));
  if (!bank) throw new NotFoundError("Bank account");
  return compileTransaction(
    {
      kind: row.kind,
      txnDate: row.txnDate,
      amount: row.amount,
      bankAccountId: bank.ledgerAccountId,
      counterAccountId: row.counterAccountId,
      amountsIncludeTax: row.amountsIncludeTax,
      vat: await taxCode(tx, row.entityId, row.taxCodeId),
      wht: await taxCode(tx, row.entityId, row.whtCodeId),
      interest: row.interestAmount ?? 0n,
      interestAccountId: row.interestAccountId,
      contactId: row.contactId,
      reference: row.reference,
      transactionId: row.id,
    },
    await accountMap(tx, row.entityId),
  );
}

async function toDto(tx: Tx, id: string): Promise<Transaction> {
  const counter = aliasedTable(schema.accounts, "counter");
  const [r] = await tx
    .select({ t: schema.transactions, bankName: schema.bankAccounts.accountName, bankBank: schema.bankAccounts.bankName, counterName: counter.name, contactName: schema.contacts.name })
    .from(schema.transactions)
    .innerJoin(schema.bankAccounts, eq(schema.bankAccounts.id, schema.transactions.bankAccountId))
    .innerJoin(counter, eq(counter.id, schema.transactions.counterAccountId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.transactions.contactId))
    .where(eq(schema.transactions.id, id));
  if (!r) throw new NotFoundError("Transaction");
  const t = r.t;
  const taxed = t.kind === "money_in" || t.kind === "money_out";
  const b = taxed
    ? taxBreakdown({ amount: t.amount, amountsIncludeTax: t.amountsIncludeTax, vat: await taxCode(tx, t.entityId, t.taxCodeId), wht: await taxCode(tx, t.entityId, t.whtCodeId) })
    : { net: t.amount, vat: 0n, wht: 0n, bank: t.amount };
  return {
    id: t.id,
    kind: t.kind,
    txnDate: t.txnDate,
    amount: t.amount.toString(),
    bankAccountId: t.bankAccountId,
    bankAccountName: r.bankBank === "Cash" ? r.bankName : `${r.bankBank} – ${r.bankName}`,
    counterAccountId: t.counterAccountId,
    counterAccountName: r.counterName,
    contactId: t.contactId,
    contactName: r.contactName,
    taxCodeId: t.taxCodeId,
    whtCodeId: t.whtCodeId,
    amountsIncludeTax: t.amountsIncludeTax,
    interestAmount: t.interestAmount?.toString() ?? null,
    interestAccountId: t.interestAccountId,
    reference: t.reference,
    notes: t.notes,
    status: t.status,
    journalEntryId: t.journalEntryId,
    breakdown: { net: b.net.toString(), vat: b.vat.toString(), wht: b.wht.toString(), bank: b.bank.toString() },
    createdAt: t.createdAt.toISOString(),
  };
}

async function postTxn(tx: Tx, ctx: ServiceContext, scope: EntityScope, row: TxnRow, idempotencyKey: string): Promise<void> {
  assertCan(scope.actor, "transaction.post", scope.entityId, ctx.now);
  const { draft } = await compile(tx, row);
  const posted = await postDraft(tx, ctx, scope, draft, idempotencyKey);
  await tx.update(schema.transactions).set({ status: "posted", journalEntryId: posted.id }).where(eq(schema.transactions.id, row.id));
  await writeAudit(tx, ctx, scope.actor.userId, {
    orgId: scope.orgId,
    entityId: scope.entityId,
    action: "transaction.post",
    targetType: "transaction",
    targetId: row.id,
    before: { status: "draft" },
    after: { status: "posted", journalEntryId: posted.id, number: posted.number },
  });
}

/**
 * Quick add (SPEC §6.4). Records a simple-mode transaction and, by default,
 * posts it through the posting map in the same transaction.
 */
export async function createTransaction(ctx: ServiceContext, entityId: string, raw: TransactionInput, idempotencyKey: string | null): Promise<Transaction> {
  const claims = requireClaims(ctx);
  const input = transactionInputSchema.parse(raw);
  if (input.post && !idempotencyKey) throw new ValidationError("Posting requires an Idempotency-Key header");

  return idempotent(() =>
    withUser(ctx.db, claims, async (tx) => {
      const scope = await entityScope(tx, claims, entityId, ctx.now);
      assertCan(scope.actor, "transaction.create", entityId, ctx.now);

      if (idempotencyKey) {
        const prior = await findByIdempotencyKey(tx, entityId, idempotencyKey);
        if (prior) {
          const [t] = await tx.select({ id: schema.transactions.id }).from(schema.transactions).where(eq(schema.transactions.journalEntryId, prior.id));
          if (t) return toDto(tx, t.id);
        }
      }

      const [bank] = await tx
        .select({ id: schema.bankAccounts.id })
        .from(schema.bankAccounts)
        .where(and(eq(schema.bankAccounts.id, input.bankAccountId), eq(schema.bankAccounts.entityId, entityId)));
      if (!bank) throw new NotFoundError("Bank account");

      const id = crypto.randomUUID();
      const values = {
        id,
        orgId: scope.orgId,
        entityId,
        kind: input.kind,
        txnDate: input.txnDate,
        amount: parseMinor(input.amount),
        bankAccountId: input.bankAccountId,
        counterAccountId: input.counterAccountId,
        contactId: input.contactId ?? null,
        taxCodeId: input.taxCodeId ?? null,
        whtCodeId: input.whtCodeId ?? null,
        amountsIncludeTax: input.amountsIncludeTax,
        interestAmount: input.interestAmount ? parseMinor(input.interestAmount) : null,
        interestAccountId: input.interestAccountId ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdBy: claims.sub,
      };
      await tx.insert(schema.transactions).values(values);
      const [row] = await tx.select().from(schema.transactions).where(eq(schema.transactions.id, id));
      if (!row) throw new NotFoundError("Transaction");
      // Validate through the posting map even for drafts, so bad drafts are caught early.
      await compile(tx, row);
      await writeAudit(tx, ctx, claims.sub, {
        orgId: scope.orgId,
        entityId,
        action: "transaction.create",
        targetType: "transaction",
        targetId: id,
        after: { kind: input.kind, txnDate: input.txnDate, amount: input.amount, reference: input.reference ?? null },
      });
      if (input.post && idempotencyKey) await postTxn(tx, ctx, scope, row, idempotencyKey);
      return toDto(tx, id);
    }),
  );
}

async function loadTxn(tx: Tx, ctx: ServiceContext, id: string) {
  const claims = requireClaims(ctx);
  const [row] = await tx.select().from(schema.transactions).where(eq(schema.transactions.id, id));
  if (!row) throw new NotFoundError("Transaction");
  return { row, scope: await entityScope(tx, claims, row.entityId, ctx.now) };
}

export async function postTransaction(ctx: ServiceContext, id: string, idempotencyKey: string): Promise<Transaction> {
  const claims = requireClaims(ctx);
  return idempotent(() =>
    withUser(ctx.db, claims, async (tx) => {
      const { row, scope } = await loadTxn(tx, ctx, id);
      if (row.status !== "draft") {
        const [entry] = row.journalEntryId ? await tx.select({ key: schema.journalEntries.idempotencyKey }).from(schema.journalEntries).where(eq(schema.journalEntries.id, row.journalEntryId)) : [];
        if (entry?.key === idempotencyKey) return toDto(tx, id);
        throw new ConflictError("This transaction is already posted");
      }
      await postTxn(tx, ctx, scope, row, idempotencyKey);
      return toDto(tx, id);
    }),
  );
}

/** Reverses a posted transaction: reverses its journal entry and marks it reversed (rule 3). */
export async function reverseTransaction(ctx: ServiceContext, id: string, raw: ReverseRequest, idempotencyKey: string): Promise<Transaction> {
  const claims = requireClaims(ctx);
  const input = reverseRequestSchema.parse(raw);
  return idempotent(() =>
    withUser(ctx.db, claims, async (tx) => {
      const { row, scope } = await loadTxn(tx, ctx, id);
      if (row.status === "draft" || !row.journalEntryId) throw new ValidationError("Only posted transactions can be reversed. Delete the draft instead.");
      await reverseEntryInTx(tx, ctx, scope, row.journalEntryId, input.reason, input.date ?? null, idempotencyKey);
      if (row.status === "posted") {
        await tx.update(schema.transactions).set({ status: "reversed" }).where(eq(schema.transactions.id, id));
        await writeAudit(tx, ctx, claims.sub, {
          orgId: scope.orgId,
          entityId: scope.entityId,
          action: "transaction.reverse",
          targetType: "transaction",
          targetId: id,
          before: { status: "posted" },
          after: { status: "reversed" },
          reason: input.reason,
        });
      }
      return toDto(tx, id);
    }),
  );
}

export async function getTransaction(ctx: ServiceContext, id: string): Promise<Transaction> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    await loadTxn(tx, ctx, id);
    return toDto(tx, id);
  });
}

export async function listTransactions(
  ctx: ServiceContext,
  entityId: string,
  q: { from?: string; to?: string; kind?: string; status?: string; contactId?: string; bankAccountId?: string; counterAccountId?: string; cursor?: string },
): Promise<{ transactions: Transaction[]; nextCursor: string | null }> {
  const claims = requireClaims(ctx);
  const PAGE = 50;
  const offset = Number(q.cursor ?? "0") || 0;
  return withUser(ctx.db, claims, async (tx) => {
    await entityScope(tx, claims, entityId, ctx.now);
    const rows = await tx.execute<{ id: string }>(sql`
      select id from transactions
       where entity_id = ${entityId}
         ${q.from ? sql`and txn_date >= ${q.from}` : sql``}
         ${q.to ? sql`and txn_date <= ${q.to}` : sql``}
         ${q.kind ? sql`and kind = ${q.kind}` : sql``}
         ${q.status ? sql`and status = ${q.status}` : sql``}
         ${q.contactId ? sql`and contact_id = ${q.contactId}` : sql``}
         ${q.bankAccountId ? sql`and bank_account_id = ${q.bankAccountId}` : sql``}
         ${q.counterAccountId ? sql`and counter_account_id = ${q.counterAccountId}` : sql``}
       order by txn_date desc, created_at desc
       limit ${PAGE + 1} offset ${offset}
    `);
    const page = [];
    for (const r of rows.slice(0, PAGE)) page.push(await toDto(tx, r.id));
    return { transactions: page, nextCursor: rows.length > PAGE ? String(offset + PAGE) : null };
  });
}
