/** SPEC §4.1: account types and their normal balances. */
export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type Side = "debit" | "credit";

export const NORMAL_BALANCE: Readonly<Record<AccountType, Side>> = {
  asset: "debit",
  liability: "credit",
  equity: "credit",
  income: "credit",
  expense: "debit",
};

/** Subtypes drive statement presentation (SPEC §4.1). Each belongs to one type. */
export const SUBTYPES_BY_TYPE = {
  asset: ["current_asset", "non_current_asset", "bank", "cash", "receivable", "inventory"],
  liability: ["current_liability", "non_current_liability", "payable", "tax_payable"],
  equity: ["equity_capital", "retained_earnings", "drawings"],
  income: ["revenue", "other_income"],
  expense: ["cost_of_sales", "operating_expense", "finance_cost", "income_tax_expense"],
} as const satisfies Record<AccountType, readonly string[]>;

export type AccountSubtype = (typeof SUBTYPES_BY_TYPE)[AccountType][number];
export const ACCOUNT_SUBTYPES = Object.values(SUBTYPES_BY_TYPE).flat() as AccountSubtype[];

export function typeOfSubtype(subtype: AccountSubtype): AccountType {
  for (const type of ACCOUNT_TYPES) {
    if ((SUBTYPES_BY_TYPE[type] as readonly string[]).includes(subtype)) return type;
  }
  throw new RangeError(`Unknown subtype ${subtype}`);
}

/** Required on balance sheet accounts, for the indirect cash flow statement. */
export const CASH_FLOW_CATEGORIES = ["cash", "operating_working_capital", "investing", "financing", "none"] as const;
export type CashFlowCategory = (typeof CASH_FLOW_CATEGORIES)[number];

/** Optional IFRS 18 category on income and expense accounts (SPEC §4.1 forward compatibility). */
export const PL_CATEGORIES = ["operating", "investing", "financing", "income_tax", "discontinued"] as const;
export type PlCategory = (typeof PL_CATEGORIES)[number];

export function isBalanceSheetType(type: AccountType): boolean {
  return type === "asset" || type === "liability" || type === "equity";
}

/** System accounts created for every entity (SPEC §4.2). */
export const SYSTEM_ACCOUNT_KEYS = [
  "accounts_receivable",
  "accounts_payable",
  "vat_output",
  "vat_input",
  "wht_receivable",
  "wht_payable",
  "retained_earnings",
  "opening_balance_equity",
  "suspense",
  "rounding",
  "fx_gain_loss",
] as const;
export type SystemAccountKey = (typeof SYSTEM_ACCOUNT_KEYS)[number];

/** The ledger's view of an account: what posting rules need to know. */
export interface LedgerAccount {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly subtype: AccountSubtype;
  readonly isLeaf: boolean;
  readonly isActive: boolean;
  readonly systemKey: SystemAccountKey | null;
}

/** Signed balance in the account's normal direction: positive means a normal balance. */
export function normalBalance(type: AccountType, debit: bigint, credit: bigint): bigint {
  return NORMAL_BALANCE[type] === "debit" ? debit - credit : credit - debit;
}

/** Maximum depth of the account hierarchy (SPEC §4.1). */
export const MAX_ACCOUNT_DEPTH = 3;
