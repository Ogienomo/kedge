/**
 * SPEC §5.2–5.3 and §5.6 (tax codes): the ledger and its simple layer.
 * Money columns are bigint minor units (rule 4); accounting dates are `date`
 * (rule 11). Invariants are enforced again by triggers in migrations.
 */
import { sql } from "drizzle-orm";
import { bigint, boolean, char, check, date, foreignKey, index, integer, numeric, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  accountSubtype,
  accountType,
  bankAccountKind,
  cashFlowCategory,
  contactKind,
  entryStatus,
  fiscalYearStatus,
  normalBalanceSide,
  periodStatus,
  plCategory,
  sequenceKind,
  sourceType,
  systemAccountKey,
  taxAppliesTo,
  taxKind,
  transactionKind,
  transactionStatus,
} from "./enums";
import { entities, users } from "./tenancy";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Every accounting row carries org_id and entity_id, tied together by this FK. */
const tenant = {
  orgId: uuid("org_id").notNull(),
  entityId: uuid("entity_id").notNull(),
};

const money = (name: string) => bigint(name, { mode: "bigint" });

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: accountType("type").notNull(),
    subtype: accountSubtype("subtype").notNull(),
    normalBalance: normalBalanceSide("normal_balance").notNull(),
    parentId: uuid("parent_id"),
    isLeaf: boolean("is_leaf").notNull().default(true),
    systemKey: systemAccountKey("system_key"),
    cashFlowCategory: cashFlowCategory("cash_flow_category"),
    plCategory: plCategory("pl_category"),
    currency: char("currency", { length: 3 }).notNull().default("NGN"),
    isActive: boolean("is_active").notNull().default(true),
    description: text("description"),
    ...timestamps,
  },
  (t) => [
    unique("accounts_entity_code_key").on(t.entityId, t.code),
    uniqueIndex("accounts_entity_system_key").on(t.entityId, t.systemKey).where(sql`${t.systemKey} is not null`),
    unique("accounts_id_entity_key").on(t.id, t.entityId),
    foreignKey({ name: "accounts_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    foreignKey({ name: "accounts_parent_fk", columns: [t.parentId, t.entityId], foreignColumns: [t.id, t.entityId] }),
    check("accounts_code_format", sql`${t.code} ~ '^[0-9]{4,6}$'`),
    check(
      "accounts_normal_balance_matches_type",
      sql`${t.normalBalance} = case when ${t.type} in ('asset', 'expense') then 'debit'::normal_balance else 'credit'::normal_balance end`,
    ),
    check("accounts_cash_flow_on_balance_sheet", sql`(${t.type} in ('asset', 'liability', 'equity')) = (${t.cashFlowCategory} is not null)`),
  ],
).enableRLS();

export const fiscalYears = pgTable(
  "fiscal_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: fiscalYearStatus("status").notNull().default("open"),
    closingEntryId: uuid("closing_entry_id"),
    ...timestamps,
  },
  (t) => [
    unique("fiscal_years_entity_start_key").on(t.entityId, t.startDate),
    unique("fiscal_years_id_entity_key").on(t.id, t.entityId),
    foreignKey({ name: "fiscal_years_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    check("fiscal_years_dates", sql`${t.endDate} > ${t.startDate}`),
  ],
).enableRLS();

export const periods = pgTable(
  "periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    fiscalYearId: uuid("fiscal_year_id").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: periodStatus("status").notNull().default("open"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: uuid("locked_by").references(() => users.id),
    lockReason: text("lock_reason"),
    unlockReason: text("unlock_reason"),
    ...timestamps,
  },
  (t) => [
    unique("periods_entity_start_key").on(t.entityId, t.startDate),
    unique("periods_id_entity_key").on(t.id, t.entityId),
    foreignKey({ name: "periods_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    foreignKey({ name: "periods_fiscal_year_fk", columns: [t.fiscalYearId, t.entityId], foreignColumns: [fiscalYears.id, fiscalYears.entityId] }).onDelete("cascade"),
    check("periods_dates", sql`${t.endDate} >= ${t.startDate}`),
    check("periods_locked_has_time", sql`${t.status} = 'open' or ${t.lockedAt} is not null`),
  ],
).enableRLS();

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    kind: contactKind("kind").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    tin: text("tin"),
    address: text("address"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("contacts_id_entity_key").on(t.id, t.entityId),
    foreignKey({ name: "contacts_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    index("contacts_entity_name_idx").on(t.entityId, t.name),
  ],
).enableRLS();

export const taxCodes = pgTable(
  "tax_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    /** Groups versions of one code; a rate change is a new version (SPEC §4.7). */
    codeKey: text("code_key").notNull(),
    kind: taxKind("kind").notNull(),
    name: text("name").notNull(),
    rateBps: integer("rate_bps").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    appliesTo: taxAppliesTo("applies_to").notNull(),
    recoverable: boolean("recoverable").notNull().default(false),
    outputAccountId: uuid("output_account_id"),
    inputAccountId: uuid("input_account_id"),
    /** Null until a qualified person verifies the rate; seeded rates start unverified. */
    verifiedBy: uuid("verified_by").references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("tax_codes_entity_key_from_key").on(t.entityId, t.codeKey, t.effectiveFrom),
    unique("tax_codes_id_entity_key").on(t.id, t.entityId),
    foreignKey({ name: "tax_codes_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    foreignKey({ name: "tax_codes_output_account_fk", columns: [t.outputAccountId, t.entityId], foreignColumns: [accounts.id, accounts.entityId] }),
    foreignKey({ name: "tax_codes_input_account_fk", columns: [t.inputAccountId, t.entityId], foreignColumns: [accounts.id, accounts.entityId] }),
    check("tax_codes_rate_range", sql`${t.rateBps} between 0 and 10000`),
    check("tax_codes_effective_range", sql`${t.effectiveTo} is null or ${t.effectiveTo} >= ${t.effectiveFrom}`),
  ],
).enableRLS();

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    number: text("number"),
    entryDate: date("entry_date").notNull(),
    periodId: uuid("period_id"),
    memo: text("memo").notNull().default(""),
    status: entryStatus("status").notNull().default("draft"),
    sourceType: sourceType("source_type").notNull(),
    sourceId: uuid("source_id"),
    reversesEntryId: uuid("reverses_entry_id"),
    reversedByEntryId: uuid("reversed_by_entry_id"),
    reversalReason: text("reversal_reason"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => users.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    idempotencyKey: text("idempotency_key"),
    ...timestamps,
  },
  (t) => [
    unique("journal_entries_entity_number_key").on(t.entityId, t.number),
    unique("journal_entries_entity_idempotency_key").on(t.entityId, t.idempotencyKey),
    unique("journal_entries_id_entity_key").on(t.id, t.entityId),
    foreignKey({ name: "journal_entries_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    foreignKey({ name: "journal_entries_period_fk", columns: [t.periodId, t.entityId], foreignColumns: [periods.id, periods.entityId] }),
    foreignKey({ name: "journal_entries_reverses_fk", columns: [t.reversesEntryId, t.entityId], foreignColumns: [t.id, t.entityId] }),
    foreignKey({ name: "journal_entries_reversed_by_fk", columns: [t.reversedByEntryId, t.entityId], foreignColumns: [t.id, t.entityId] }),
    check("journal_entries_posted_complete", sql`${t.status} = 'draft' or (${t.number} is not null and ${t.postedAt} is not null and ${t.periodId} is not null and ${t.idempotencyKey} is not null)`),
    check("journal_entries_reversal_reason", sql`${t.sourceType} <> 'reversal' or (${t.reversesEntryId} is not null and coalesce(${t.reversalReason}, '') <> '')`),
    index("journal_entries_entity_date_idx").on(t.entityId, t.entryDate),
    index("journal_entries_source_idx").on(t.sourceType, t.sourceId),
  ],
).enableRLS();

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    entryId: uuid("entry_id").notNull(),
    lineNo: smallint("line_no").notNull(),
    accountId: uuid("account_id").notNull(),
    debit: money("debit").notNull().default(sql`0`),
    credit: money("credit").notNull().default(sql`0`),
    currency: char("currency", { length: 3 }).notNull().default("NGN"),
    txnAmount: money("txn_amount"),
    fxRate: numeric("fx_rate", { precision: 20, scale: 10 }),
    contactId: uuid("contact_id"),
    taxCodeId: uuid("tax_code_id"),
    description: text("description"),
    ...timestamps,
  },
  (t) => [
    unique("journal_lines_entry_line_key").on(t.entryId, t.lineNo),
    foreignKey({ name: "journal_lines_entry_fk", columns: [t.entryId, t.entityId], foreignColumns: [journalEntries.id, journalEntries.entityId] }).onDelete("cascade"),
    foreignKey({ name: "journal_lines_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    // Same-entity account: a line can never point at another entity's account.
    foreignKey({ name: "journal_lines_account_fk", columns: [t.accountId, t.entityId], foreignColumns: [accounts.id, accounts.entityId] }),
    foreignKey({ name: "journal_lines_contact_fk", columns: [t.contactId, t.entityId], foreignColumns: [contacts.id, contacts.entityId] }),
    foreignKey({ name: "journal_lines_tax_code_fk", columns: [t.taxCodeId, t.entityId], foreignColumns: [taxCodes.id, taxCodes.entityId] }),
    // Rule 2: exactly one positive amount per line.
    check("journal_lines_one_side", sql`(${t.debit} > 0 and ${t.credit} = 0) or (${t.credit} > 0 and ${t.debit} = 0)`),
    index("journal_lines_entity_account_idx").on(t.entityId, t.accountId),
  ],
).enableRLS();

export const numberSequences = pgTable(
  "number_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    fiscalYearId: uuid("fiscal_year_id").notNull(),
    kind: sequenceKind("kind").notNull(),
    nextValue: integer("next_value").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    unique("number_sequences_key").on(t.entityId, t.fiscalYearId, t.kind),
    foreignKey({ name: "number_sequences_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    foreignKey({ name: "number_sequences_fiscal_year_fk", columns: [t.fiscalYearId, t.entityId], foreignColumns: [fiscalYears.id, fiscalYears.entityId] }).onDelete("cascade"),
    check("number_sequences_positive", sql`${t.nextValue} >= 1`),
  ],
).enableRLS();

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    ledgerAccountId: uuid("ledger_account_id").notNull(),
    bankName: text("bank_name").notNull(),
    accountName: text("account_name").notNull(),
    /** Last four digits only, e.g. "•••• 1234". */
    accountNumberMasked: text("account_number_masked"),
    /** AES-256-GCM ciphertext produced by the application (never plaintext). */
    accountNumberEncrypted: text("account_number_encrypted"),
    currency: char("currency", { length: 3 }).notNull().default("NGN"),
    kind: bankAccountKind("kind").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("bank_accounts_ledger_account_key").on(t.ledgerAccountId),
    unique("bank_accounts_id_entity_key").on(t.id, t.entityId),
    foreignKey({ name: "bank_accounts_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    foreignKey({ name: "bank_accounts_ledger_account_fk", columns: [t.ledgerAccountId, t.entityId], foreignColumns: [accounts.id, accounts.entityId] }),
    check("bank_accounts_number_never_plain", sql`${t.accountNumberEncrypted} is null or ${t.accountNumberEncrypted} like 'v1:%'`),
  ],
).enableRLS();

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    kind: transactionKind("kind").notNull(),
    txnDate: date("txn_date").notNull(),
    amount: money("amount").notNull(),
    bankAccountId: uuid("bank_account_id").notNull(),
    counterAccountId: uuid("counter_account_id").notNull(),
    contactId: uuid("contact_id"),
    taxCodeId: uuid("tax_code_id"),
    whtCodeId: uuid("wht_code_id"),
    amountsIncludeTax: boolean("amounts_include_tax").notNull().default(false),
    /** Loan repayments only: the interest part and where it is posted. */
    interestAmount: money("interest_amount"),
    interestAccountId: uuid("interest_account_id"),
    reference: text("reference"),
    notes: text("notes"),
    status: transactionStatus("status").notNull().default("draft"),
    journalEntryId: uuid("journal_entry_id"),
    statementLineId: uuid("statement_line_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    unique("transactions_id_entity_key").on(t.id, t.entityId),
    foreignKey({ name: "transactions_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    foreignKey({ name: "transactions_bank_account_fk", columns: [t.bankAccountId, t.entityId], foreignColumns: [bankAccounts.id, bankAccounts.entityId] }),
    foreignKey({ name: "transactions_counter_account_fk", columns: [t.counterAccountId, t.entityId], foreignColumns: [accounts.id, accounts.entityId] }),
    foreignKey({ name: "transactions_interest_account_fk", columns: [t.interestAccountId, t.entityId], foreignColumns: [accounts.id, accounts.entityId] }),
    foreignKey({ name: "transactions_contact_fk", columns: [t.contactId, t.entityId], foreignColumns: [contacts.id, contacts.entityId] }),
    foreignKey({ name: "transactions_tax_code_fk", columns: [t.taxCodeId, t.entityId], foreignColumns: [taxCodes.id, taxCodes.entityId] }),
    foreignKey({ name: "transactions_wht_code_fk", columns: [t.whtCodeId, t.entityId], foreignColumns: [taxCodes.id, taxCodes.entityId] }),
    foreignKey({ name: "transactions_journal_entry_fk", columns: [t.journalEntryId, t.entityId], foreignColumns: [journalEntries.id, journalEntries.entityId] }),
    check("transactions_amount_positive", sql`${t.amount} > 0`),
    check("transactions_posted_has_entry", sql`${t.status} = 'draft' or ${t.journalEntryId} is not null`),
    index("transactions_entity_date_idx").on(t.entityId, t.txnDate),
  ],
).enableRLS();
