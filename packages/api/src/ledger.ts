/**
 * /api/v1 contracts for Phase 1 (ledger core). Amounts are strings of
 * integer minor units (rule 4); dates are YYYY-MM-DD (rule 11).
 */
import {
  ACCOUNT_SUBTYPES,
  ACCOUNT_TYPES,
  CASH_FLOW_CATEGORIES,
  COA_TEMPLATE_KEYS,
  PERIOD_STATUSES,
  SOURCE_TYPES,
  SYSTEM_ACCOUNT_KEYS,
  TAX_APPLIES_TO,
  TAX_KINDS,
  TRANSACTION_KINDS,
  isIsoDate,
} from "@kedge/core";
import { z } from "zod";

const id = z.uuid();
export const isoDateSchema = z.string().refine(isIsoDate, "Use a date in the form YYYY-MM-DD");
/** Signed integer minor units as a string ("123456"). */
export const minorSchema = z.string().regex(/^-?(0|[1-9]\d*)$/, "Amounts are integer minor units sent as a string");
/** Strictly positive minor units. */
export const positiveMinorSchema = z.string().regex(/^[1-9]\d*$/, "Enter an amount greater than zero");
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export const accountSubtypeSchema = z.enum(ACCOUNT_SUBTYPES as [string, ...string[]]);
export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export const transactionKindSchema = z.enum(TRANSACTION_KINDS);

// ---------------------------------------------------------------- entity set-up (onboarding)

export const bankAccountInputSchema = z.object({
  bankName: z.string().trim().min(1).max(100),
  accountName: z.string().trim().min(1).max(200),
  /** Plain account number; encrypted by the server and never returned. */
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, "Account numbers are 6–20 digits")
    .nullable()
    .optional(),
  kind: z.enum(["current", "savings", "wallet", "cash", "card"]),
});
export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;

export const entitySetupRequestSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  tradingName: optionalText(200),
  rcNumber: optionalText(40),
  tin: optionalText(40),
  vatRegistered: z.boolean(),
  industry: optionalText(100),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  goLiveDate: isoDateSchema,
  coaTemplate: z.enum(COA_TEMPLATE_KEYS),
  bankAccounts: z.array(bankAccountInputSchema).max(20).default([]),
});
export type EntitySetupRequest = z.input<typeof entitySetupRequestSchema>;

export const entityDetailSchema = z.object({
  id,
  orgId: id,
  legalName: z.string(),
  tradingName: z.string().nullable(),
  rcNumber: z.string().nullable(),
  tin: z.string().nullable(),
  vatRegistered: z.boolean(),
  industry: z.string().nullable(),
  functionalCurrency: z.string(),
  fiscalYearStartMonth: z.number(),
  timezone: z.string(),
  coaTemplate: z.string().nullable(),
  goLiveDate: isoDateSchema.nullable(),
  /** True once the books exist (CoA, fiscal years, periods). */
  booksReady: z.boolean(),
  /** Today in the entity's timezone. */
  today: isoDateSchema,
  setup: z.object({
    coaReviewed: z.boolean(),
    bankAccountsAdded: z.boolean(),
    openingBalancesDone: z.boolean(),
    openingBalanceEquity: minorSchema,
  }),
});
export type EntityDetail = z.infer<typeof entityDetailSchema>;

// ---------------------------------------------------------------- accounts

export const accountSchema = z.object({
  id,
  code: z.string(),
  name: z.string(),
  type: accountTypeSchema,
  subtype: accountSubtypeSchema,
  parentId: id.nullable(),
  isLeaf: z.boolean(),
  isActive: z.boolean(),
  systemKey: z.enum(SYSTEM_ACCOUNT_KEYS).nullable(),
  cashFlowCategory: z.enum(CASH_FLOW_CATEGORIES).nullable(),
  description: z.string().nullable(),
  /** Balance in the account's normal direction, as at today. */
  balance: minorSchema,
  hasPostings: z.boolean(),
});
export type Account = z.infer<typeof accountSchema>;
export const accountsResponseSchema = z.object({ accounts: z.array(accountSchema) });

export const createAccountRequestSchema = z.object({
  code: z.string().regex(/^\d{4,6}$/, "Codes are 4–6 digits"),
  name: z.string().trim().min(1).max(200),
  subtype: accountSubtypeSchema,
  parentId: id.nullable().optional(),
  cashFlowCategory: z.enum(CASH_FLOW_CATEGORIES).nullable().optional(),
  description: optionalText(500),
});
export type CreateAccountRequest = z.input<typeof createAccountRequestSchema>;

export const updateAccountRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  code: z
    .string()
    .regex(/^\d{4,6}$/)
    .optional(),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});
export type UpdateAccountRequest = z.input<typeof updateAccountRequestSchema>;

// ---------------------------------------------------------------- journals

export const journalLineInputSchema = z
  .object({
    accountId: id,
    debit: minorSchema.default("0"),
    credit: minorSchema.default("0"),
    contactId: id.nullable().optional(),
    taxCodeId: id.nullable().optional(),
    description: optionalText(500),
  })
  .refine((l) => !l.debit.startsWith("-") && !l.credit.startsWith("-"), "Amounts cannot be negative");
export type JournalLineInput = z.input<typeof journalLineInputSchema>;

export const journalDraftRequestSchema = z.object({
  entryDate: isoDateSchema,
  memo: z.string().trim().max(500).default(""),
  lines: z.array(journalLineInputSchema).max(200),
  /** Post immediately (requires an Idempotency-Key header). */
  post: z.boolean().default(false),
});
export type JournalDraftRequest = z.input<typeof journalDraftRequestSchema>;

export const journalLineSchema = z.object({
  lineNo: z.number(),
  accountId: id,
  accountCode: z.string(),
  accountName: z.string(),
  debit: minorSchema,
  credit: minorSchema,
  contactId: id.nullable(),
  contactName: z.string().nullable(),
  taxCodeId: id.nullable(),
  description: z.string().nullable(),
});

export const journalSummarySchema = z.object({
  id,
  number: z.string().nullable(),
  entryDate: isoDateSchema,
  memo: z.string(),
  status: z.enum(["draft", "posted"]),
  sourceType: sourceTypeSchema,
  sourceId: id.nullable(),
  total: minorSchema,
  reversedByEntryId: id.nullable(),
  reversesEntryId: id.nullable(),
  postedAt: z.string().nullable(),
});
export type JournalSummary = z.infer<typeof journalSummarySchema>;

export const journalDetailSchema = journalSummarySchema.extend({
  lines: z.array(journalLineSchema),
  reversalReason: z.string().nullable(),
  createdBy: z.string().nullable(),
  postedBy: z.string().nullable(),
});
export type JournalDetail = z.infer<typeof journalDetailSchema>;

export const journalsResponseSchema = z.object({ journals: z.array(journalSummarySchema), nextCursor: z.string().nullable() });

export const reverseRequestSchema = z.object({
  reason: z.string().trim().min(1, "Give a reason").max(500),
  /** Defaults to the original date, or the first open date after it (SPEC §4.3). */
  date: isoDateSchema.nullable().optional(),
});
export type ReverseRequest = z.input<typeof reverseRequestSchema>;

// ---------------------------------------------------------------- periods

export const periodSchema = z.object({
  id,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  status: z.enum(PERIOD_STATUSES),
  lockedAt: z.string().nullable(),
  lockReason: z.string().nullable(),
  unlockReason: z.string().nullable(),
});
export const fiscalYearSchema = z.object({
  id,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  status: z.enum(["open", "closed"]),
  periods: z.array(periodSchema),
});
export const periodsResponseSchema = z.object({ fiscalYears: z.array(fiscalYearSchema) });
export type FiscalYear = z.infer<typeof fiscalYearSchema>;

export const lockPeriodRequestSchema = z.object({ reason: optionalText(500) });
export const unlockPeriodRequestSchema = z.object({ reason: z.string().trim().min(1, "Give a reason").max(500) });

// ---------------------------------------------------------------- contacts

export const contactKindSchema = z.enum(["customer", "supplier", "both", "other"]);
export const contactInputSchema = z.object({
  kind: contactKindSchema,
  name: z.string().trim().min(1).max(200),
  email: z.email().nullable().optional().or(z.literal("").transform(() => null)),
  phone: optionalText(40),
  tin: optionalText(40),
  address: optionalText(500),
});
export type ContactInput = z.input<typeof contactInputSchema>;
export const contactSchema = z.object({
  id,
  kind: contactKindSchema,
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  tin: z.string().nullable(),
  address: z.string().nullable(),
  isActive: z.boolean(),
});
export type Contact = z.infer<typeof contactSchema>;
export const contactsResponseSchema = z.object({ contacts: z.array(contactSchema) });

// ---------------------------------------------------------------- tax codes, bank accounts

export const taxCodeSchema = z.object({
  id,
  codeKey: z.string(),
  kind: z.enum(TAX_KINDS),
  name: z.string(),
  rateBps: z.number().int(),
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.nullable(),
  appliesTo: z.enum(TAX_APPLIES_TO),
  recoverable: z.boolean(),
  verified: z.boolean(),
});
export type TaxCodeDto = z.infer<typeof taxCodeSchema>;
export const taxCodesResponseSchema = z.object({ taxCodes: z.array(taxCodeSchema) });

export const createTaxCodeRequestSchema = z.object({
  codeKey: z.string().regex(/^[A-Z][A-Z0-9_]{1,40}$/, "Use capitals, digits and underscores"),
  kind: z.enum(TAX_KINDS),
  name: z.string().trim().min(1).max(100),
  rateBps: z.number().int().min(0).max(10_000),
  effectiveFrom: isoDateSchema,
  appliesTo: z.enum(TAX_APPLIES_TO),
  recoverable: z.boolean().default(false),
});
export type CreateTaxCodeRequest = z.input<typeof createTaxCodeRequestSchema>;

export const bankAccountSchema = z.object({
  id,
  ledgerAccountId: id,
  bankName: z.string(),
  accountName: z.string(),
  accountNumberMasked: z.string().nullable(),
  kind: z.enum(["current", "savings", "wallet", "cash", "card"]),
  currency: z.string(),
  isActive: z.boolean(),
  balance: minorSchema,
});
export type BankAccount = z.infer<typeof bankAccountSchema>;
export const bankAccountsResponseSchema = z.object({ bankAccounts: z.array(bankAccountSchema) });

// ---------------------------------------------------------------- transactions

export const transactionInputSchema = z.object({
  kind: transactionKindSchema,
  txnDate: isoDateSchema,
  amount: positiveMinorSchema,
  bankAccountId: id,
  counterAccountId: id,
  contactId: id.nullable().optional(),
  taxCodeId: id.nullable().optional(),
  whtCodeId: id.nullable().optional(),
  amountsIncludeTax: z.boolean().default(false),
  interestAmount: minorSchema.nullable().optional(),
  interestAccountId: id.nullable().optional(),
  reference: optionalText(100),
  notes: optionalText(1000),
  post: z.boolean().default(true),
});
export type TransactionInput = z.input<typeof transactionInputSchema>;

export const transactionSchema = z.object({
  id,
  kind: transactionKindSchema,
  txnDate: isoDateSchema,
  amount: minorSchema,
  bankAccountId: id,
  bankAccountName: z.string(),
  counterAccountId: id,
  counterAccountName: z.string(),
  contactId: id.nullable(),
  contactName: z.string().nullable(),
  taxCodeId: id.nullable(),
  whtCodeId: id.nullable(),
  amountsIncludeTax: z.boolean(),
  interestAmount: minorSchema.nullable(),
  interestAccountId: id.nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(["draft", "posted", "reversed"]),
  journalEntryId: id.nullable(),
  breakdown: z.object({ net: minorSchema, vat: minorSchema, wht: minorSchema, bank: minorSchema }),
  createdAt: z.string(),
});
export type Transaction = z.infer<typeof transactionSchema>;
export const transactionsResponseSchema = z.object({ transactions: z.array(transactionSchema), nextCursor: z.string().nullable() });

// ---------------------------------------------------------------- opening balances

export const openingBalancesRequestSchema = z.object({
  balances: z
    .array(z.object({ accountId: id, debit: minorSchema.default("0"), credit: minorSchema.default("0") }))
    .min(1)
    .max(500),
});
export type OpeningBalancesRequest = z.input<typeof openingBalancesRequestSchema>;

// ---------------------------------------------------------------- reports

export const REPORT_KEYS = ["trial-balance", "general-ledger", "income-statement", "balance-sheet", "journal", "expense-by-category", "income-by-source"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const reportQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  asOf: isoDateSchema.optional(),
  compare: z.enum(["none", "previous_period", "previous_year"]).default("none"),
  includeZero: z.coerce.boolean().default(false),
  accountId: id.optional(),
  sourceType: sourceTypeSchema.optional(),
});
export type ReportQuery = z.input<typeof reportQuerySchema>;

const reportAccountRef = z.object({ id, code: z.string(), name: z.string(), subtype: accountSubtypeSchema });
export const integrityCheckSchema = z.object({ name: z.enum(["trial_balance", "accounting_equation"]), passed: z.boolean(), detail: z.string() });

const statementRow = z.object({ account: reportAccountRef, amount: minorSchema, comparative: minorSchema.nullable() });
const statementSection = z.object({ key: z.string(), rows: z.array(statementRow), total: minorSchema, comparativeTotal: minorSchema.nullable() });
const figure = z.object({ amount: minorSchema, comparative: minorSchema.nullable() });

export const reportResponseSchema = z.discriminatedUnion("report", [
  z.object({
    report: z.literal("trial-balance"),
    asOf: isoDateSchema,
    rows: z.array(z.object({ account: reportAccountRef, debit: minorSchema, credit: minorSchema })),
    totalDebit: minorSchema,
    totalCredit: minorSchema,
    checks: z.array(integrityCheckSchema),
  }),
  z.object({
    report: z.literal("general-ledger"),
    from: isoDateSchema,
    to: isoDateSchema,
    accounts: z.array(
      z.object({
        account: reportAccountRef,
        opening: minorSchema,
        closing: minorSchema,
        totalDebit: minorSchema,
        totalCredit: minorSchema,
        rows: z.array(
          z.object({
            entryId: id,
            entryNumber: z.string(),
            date: isoDateSchema,
            memo: z.string(),
            description: z.string().nullable(),
            debit: minorSchema,
            credit: minorSchema,
            balance: minorSchema,
          }),
        ),
      }),
    ),
    checks: z.array(integrityCheckSchema),
  }),
  z.object({
    report: z.literal("income-statement"),
    from: isoDateSchema,
    to: isoDateSchema,
    comparativeFrom: isoDateSchema.nullable(),
    comparativeTo: isoDateSchema.nullable(),
    revenue: statementSection,
    costOfSales: statementSection,
    grossProfit: figure,
    operatingExpenses: statementSection,
    operatingProfit: figure,
    otherIncome: statementSection,
    financeCosts: statementSection,
    profitBeforeTax: figure,
    incomeTax: statementSection,
    profitForPeriod: figure,
    checks: z.array(integrityCheckSchema),
  }),
  z.object({
    report: z.literal("balance-sheet"),
    asOf: isoDateSchema,
    comparativeAsOf: isoDateSchema.nullable(),
    nonCurrentAssets: statementSection,
    currentAssets: statementSection,
    totalAssets: figure,
    equity: statementSection,
    priorYearsEarnings: figure,
    currentYearEarnings: figure,
    totalEquity: figure,
    nonCurrentLiabilities: statementSection,
    currentLiabilities: statementSection,
    totalLiabilities: figure,
    checks: z.array(integrityCheckSchema),
  }),
  z.object({
    report: z.literal("journal"),
    from: isoDateSchema,
    to: isoDateSchema,
    entries: z.array(
      z.object({
        entryId: id,
        number: z.string(),
        date: isoDateSchema,
        memo: z.string(),
        sourceType: sourceTypeSchema,
        total: minorSchema,
        lines: z.array(z.object({ account: reportAccountRef, debit: minorSchema, credit: minorSchema, description: z.string().nullable() })),
      }),
    ),
    checks: z.array(integrityCheckSchema),
  }),
  z.object({
    report: z.enum(["expense-by-category", "income-by-source"]),
    from: isoDateSchema,
    to: isoDateSchema,
    total: minorSchema,
    rows: z.array(z.object({ account: reportAccountRef, amount: minorSchema, shareBps: z.number() })),
    checks: z.array(integrityCheckSchema),
  }),
]);
export type ReportResponse = z.infer<typeof reportResponseSchema>;

// ---------------------------------------------------------------- dashboard, practice, audit

export const dashboardSchema = z.object({
  today: isoDateSchema,
  cash: z.object({ total: minorSchema, accounts: z.array(z.object({ id, name: z.string(), balance: minorSchema })) }),
  thisMonth: z.object({ moneyIn: minorSchema, moneyOut: minorSchema }),
  trend: z.array(z.object({ month: z.string(), moneyIn: minorSchema, moneyOut: minorSchema })),
  topExpenses: z.array(z.object({ name: z.string(), amount: minorSchema })),
  attention: z.array(z.object({ kind: z.string(), message: z.string(), href: z.string().nullable() })),
  accountant: z.object({
    trialBalanceBalanced: z.boolean(),
    suspenseBalance: minorSchema,
    draftCount: z.number(),
    currentPeriod: z.object({ startDate: isoDateSchema, endDate: isoDateSchema, status: z.enum(PERIOD_STATUSES) }).nullable(),
    latestLockedPeriodEnd: isoDateSchema.nullable(),
  }),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const practiceClientSchema = z.object({
  entityId: id,
  name: z.string(),
  assignedStaff: z.array(z.object({ userId: id, name: z.string(), role: z.string() })),
  suspenseBalance: minorSchema,
  latestLockedPeriodEnd: isoDateSchema.nullable(),
  booksReady: z.boolean(),
  draftCount: z.number(),
});
export const practiceResponseSchema = z.object({ clients: z.array(practiceClientSchema) });
export type PracticeClient = z.infer<typeof practiceClientSchema>;

export const auditEntrySchema = z.object({
  id,
  at: z.string(),
  actorName: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  entityId: id.nullable(),
  reason: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export const auditResponseSchema = z.object({ entries: z.array(auditEntrySchema), nextCursor: z.string().nullable() });
