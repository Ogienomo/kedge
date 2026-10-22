import type { BankAccountInput, EntityDetail, EntitySetupRequest } from "@kedge/api";
import { entitySetupRequestSchema } from "@kedge/api";
import {
  assertCan,
  COA_TEMPLATES,
  ConflictError,
  fiscalYearContaining,
  fiscalYearStarting,
  monthlyPeriods,
  NORMAL_BALANCE,
  openingBalanceDate,
  parseIsoDate,
  typeOfSubtype,
  ValidationError,
  type DateRange,
} from "@kedge/core";
import { schema, SEED_VAT_CODES, withUser, type Tx } from "@kedge/db";
import { and, eq, sql } from "drizzle-orm";
import { loadActor } from "../../actor";
import { writeAudit } from "../../audit";
import { requireClaims, type ServiceContext } from "../../context";
import { encryptAccountNumber, maskAccountNumber } from "../../crypto";
import { entityScope, type EntityScope } from "./scope";

/** Creates a fiscal year with its twelve open periods and journal sequence. */
export async function createFiscalYear(tx: Tx, scope: Pick<EntityScope, "orgId" | "entityId">, fy: DateRange): Promise<string> {
  const id = crypto.randomUUID();
  await tx.insert(schema.fiscalYears).values({ id, orgId: scope.orgId, entityId: scope.entityId, ...fy });
  await tx.insert(schema.periods).values(monthlyPeriods(fy).map((p) => ({ orgId: scope.orgId, entityId: scope.entityId, fiscalYearId: id, ...p })));
  await tx.insert(schema.numberSequences).values({ orgId: scope.orgId, entityId: scope.entityId, fiscalYearId: id, kind: "journal" });
  return id;
}

async function addBankAccount(tx: Tx, ctx: ServiceContext, scope: Pick<EntityScope, "orgId" | "entityId">, input: BankAccountInput, ledgerAccountId: string): Promise<string> {
  let encrypted: string | null = null;
  let masked: string | null = null;
  if (input.accountNumber) {
    if (!ctx.bankAccountKey) throw new ValidationError("Bank account numbers cannot be stored until encryption is configured");
    encrypted = encryptAccountNumber(input.accountNumber, ctx.bankAccountKey);
    masked = maskAccountNumber(input.accountNumber);
  }
  const id = crypto.randomUUID();
  await tx.insert(schema.bankAccounts).values({
    id,
    orgId: scope.orgId,
    entityId: scope.entityId,
    ledgerAccountId,
    bankName: input.bankName,
    accountName: input.accountName,
    accountNumberEncrypted: encrypted,
    accountNumberMasked: masked,
    kind: input.kind,
  });
  return id;
}

/** Next free 4-digit code after `from` within the same thousand. */
async function nextFreeCode(tx: Tx, entityId: string, from: number, to: number): Promise<string> {
  const rows = await tx.select({ code: schema.accounts.code }).from(schema.accounts).where(eq(schema.accounts.entityId, entityId));
  const used = new Set(rows.map((r) => r.code));
  for (let c = from; c <= to; c++) if (!used.has(String(c))) return String(c);
  throw new ConflictError("No free account codes left in this range");
}

/** Creates a bank or cash ledger account under "Cash and bank" plus its bank_accounts row. */
export async function createBankAccountWithLedger(tx: Tx, ctx: ServiceContext, scope: Pick<EntityScope, "orgId" | "entityId">, input: BankAccountInput): Promise<string> {
  const [header] = await tx
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.entityId, scope.entityId), eq(schema.accounts.code, "1000")));
  const subtype = input.kind === "cash" ? "cash" : "bank";
  const ledgerId = crypto.randomUUID();
  await tx.insert(schema.accounts).values({
    id: ledgerId,
    orgId: scope.orgId,
    entityId: scope.entityId,
    code: await nextFreeCode(tx, scope.entityId, 1021, 1099),
    name: `${input.bankName} – ${input.accountName}`,
    type: "asset",
    subtype,
    normalBalance: "debit",
    cashFlowCategory: "cash",
    parentId: header?.id ?? null,
  });
  return addBankAccount(tx, ctx, scope, input, ledgerId);
}

/**
 * Sets up the books (SPEC §6.2 steps 1–4): business details, fiscal years
 * and periods, the chart of accounts from a template, VAT codes (seeded
 * unverified), and bank accounts. Opening balances are a separate step.
 */
async function setUpBooks(tx: Tx, ctx: ServiceContext, scope: Pick<EntityScope, "orgId" | "entityId" | "actor">, req: ReturnType<typeof entitySetupRequestSchema.parse>): Promise<void> {
  assertCan(scope.actor, "entity.settings.edit", scope.entityId, ctx.now);
  assertCan(scope.actor, "coa.edit", scope.entityId, ctx.now);

  const [existing] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.accounts).where(eq(schema.accounts.entityId, scope.entityId));
  if ((existing?.n ?? 0) > 0) throw new ConflictError("The books for this business are already set up");

  parseIsoDate(req.goLiveDate);
  await tx
    .update(schema.entities)
    .set({
      legalName: req.legalName,
      tradingName: req.tradingName ?? null,
      rcNumber: req.rcNumber ?? null,
      tin: req.tin ?? null,
      vatRegistered: req.vatRegistered,
      industry: req.industry ?? null,
      fiscalYearStartMonth: req.fiscalYearStartMonth,
      goLiveDate: req.goLiveDate,
      coaTemplate: req.coaTemplate,
    })
    .where(eq(schema.entities.id, scope.entityId));

  // Fiscal years: the one containing go-live, the one containing the opening
  // balance date (the day before, if that is an earlier year), and the next.
  const current = fiscalYearContaining(req.goLiveDate, req.fiscalYearStartMonth);
  const obYear = fiscalYearContaining(openingBalanceDate(req.goLiveDate), req.fiscalYearStartMonth);
  const next = fiscalYearStarting(Number(current.startDate.slice(0, 4)) + 1, req.fiscalYearStartMonth);
  const years = [obYear, current, next].filter((y, i, all) => all.findIndex((o) => o.startDate === y.startDate) === i);
  for (const fy of years) await createFiscalYear(tx, scope, fy);

  // Chart of accounts: parents before children.
  const template = COA_TEMPLATES[req.coaTemplate];
  const idByCode = new Map(template.accounts.map((a) => [a.code, crypto.randomUUID()]));
  const ordered = [...template.accounts].sort((a, b) => (a.parentCode ? 1 : 0) - (b.parentCode ? 1 : 0));
  for (const a of ordered) {
    const type = typeOfSubtype(a.subtype);
    await tx.insert(schema.accounts).values({
      id: idByCode.get(a.code) as string,
      orgId: scope.orgId,
      entityId: scope.entityId,
      code: a.code,
      name: a.name,
      type,
      subtype: a.subtype,
      normalBalance: NORMAL_BALANCE[type],
      parentId: a.parentCode ? (idByCode.get(a.parentCode) ?? null) : null,
      systemKey: a.systemKey ?? null,
      cashFlowCategory: a.cashFlowCategory,
      description: a.description ?? null,
    });
  }

  // VAT codes (rule 10: data, created unverified).
  const vatOutput = idByCode.get(template.accounts.find((a) => a.systemKey === "vat_output")?.code ?? "") ?? null;
  const vatInput = idByCode.get(template.accounts.find((a) => a.systemKey === "vat_input")?.code ?? "") ?? null;
  await tx.insert(schema.taxCodes).values(
    SEED_VAT_CODES.map((c) => ({ ...c, orgId: scope.orgId, entityId: scope.entityId, outputAccountId: vatOutput, inputAccountId: vatInput })),
  );

  // Cash on hand is always recordable; the first bank account takes over "Main bank account".
  await addBankAccount(tx, ctx, scope, { bankName: "Cash", accountName: "Cash on hand", kind: "cash" }, idByCode.get("1010") as string);
  const [first, ...rest] = req.bankAccounts;
  const mainId = idByCode.get("1020") as string;
  if (first) {
    await tx.update(schema.accounts).set({ name: `${first.bankName} – ${first.accountName}` }).where(eq(schema.accounts.id, mainId));
    await addBankAccount(tx, ctx, scope, first, mainId);
  } else {
    await addBankAccount(tx, ctx, scope, { bankName: "Bank", accountName: "Main bank account", kind: "current" }, mainId);
  }
  for (const b of rest) await createBankAccountWithLedger(tx, ctx, scope, b);

  await writeAudit(tx, ctx, scope.actor.userId, {
    orgId: scope.orgId,
    entityId: scope.entityId,
    action: "entity.setup",
    targetType: "entity",
    targetId: scope.entityId,
    after: {
      coaTemplate: req.coaTemplate,
      fiscalYearStartMonth: req.fiscalYearStartMonth,
      goLiveDate: req.goLiveDate,
      vatRegistered: req.vatRegistered,
      fiscalYears: years.map((y) => y.startDate),
      bankAccounts: req.bankAccounts.length,
    },
  });
}

/** Onboarding: creates a business (entity) and its books in one transaction. */
export async function createEntityWithBooks(ctx: ServiceContext, orgId: string, raw: EntitySetupRequest): Promise<EntityDetail> {
  const claims = requireClaims(ctx);
  const req = entitySetupRequestSchema.parse(raw);
  const entityId = crypto.randomUUID();
  await withUser(ctx.db, claims, async (tx) => {
    const actor = await loadActor(tx, claims, orgId);
    assertCan(actor, "entity.create", null, ctx.now);
    await tx.insert(schema.entities).values({ id: entityId, orgId, legalName: req.legalName });
    await writeAudit(tx, ctx, claims.sub, { orgId, entityId, action: "entity.create", targetType: "entity", targetId: entityId, after: { legalName: req.legalName } });
    await setUpBooks(tx, ctx, { orgId, entityId, actor }, req);
  });
  return getEntityDetail(ctx, entityId);
}

/** Sets up books for an entity created as a shell (Phase 0) or by a firm. */
export async function setUpEntityBooks(ctx: ServiceContext, entityId: string, raw: EntitySetupRequest): Promise<EntityDetail> {
  const claims = requireClaims(ctx);
  const req = entitySetupRequestSchema.parse(raw);
  await withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    await setUpBooks(tx, ctx, scope, req);
  });
  return getEntityDetail(ctx, entityId);
}

export async function getEntityDetail(ctx: ServiceContext, entityId: string): Promise<EntityDetail> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const { entity, today } = await entityScope(tx, claims, entityId, ctx.now);
    const [counts] = await tx.execute<{ accounts: number; banks: number; ob_entries: number; obe: string | null }>(sql`
      select
        (select count(*)::int from accounts where entity_id = ${entityId}) as accounts,
        (select count(*)::int from bank_accounts where entity_id = ${entityId} and kind <> 'cash') as banks,
        (select count(*)::int from journal_entries where entity_id = ${entityId} and status = 'posted' and source_type = 'opening_balance') as ob_entries,
        (select (coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0))::text
           from journal_lines l
           join journal_entries e on e.id = l.entry_id and e.status = 'posted'
           join accounts a on a.id = l.account_id and a.system_key = 'opening_balance_equity'
          where l.entity_id = ${entityId}) as obe
    `);
    const obe = counts?.obe ?? "0";
    return {
      id: entity.id,
      orgId: entity.orgId,
      legalName: entity.legalName,
      tradingName: entity.tradingName,
      rcNumber: entity.rcNumber,
      tin: entity.tin,
      vatRegistered: entity.vatRegistered,
      industry: entity.industry,
      functionalCurrency: entity.functionalCurrency,
      fiscalYearStartMonth: entity.fiscalYearStartMonth,
      timezone: entity.timezone,
      coaTemplate: entity.coaTemplate,
      goLiveDate: entity.goLiveDate,
      booksReady: (counts?.accounts ?? 0) > 0,
      today,
      setup: {
        coaReviewed: (counts?.accounts ?? 0) > 0,
        bankAccountsAdded: (counts?.banks ?? 0) > 0,
        openingBalancesDone: (counts?.ob_entries ?? 0) > 0 && obe === "0",
        openingBalanceEquity: obe,
      },
    };
  });
}
