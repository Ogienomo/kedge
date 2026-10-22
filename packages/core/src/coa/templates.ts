/**
 * Chart of accounts templates offered at entity creation (SPEC §4.1).
 *
 * DRAFT FOR REVIEW: account names and groupings should be reviewed by a
 * Nigerian chartered accountant before launch. Code ranges follow SPEC §4.1.
 */
import type { AccountSubtype, CashFlowCategory, SystemAccountKey } from "../ledger/accounts";
import { isBalanceSheetType, typeOfSubtype } from "../ledger/accounts";

export const COA_TEMPLATE_KEYS = ["general_sme", "service", "trading", "school"] as const;
export type CoaTemplateKey = (typeof COA_TEMPLATE_KEYS)[number];

export interface TemplateAccount {
  readonly code: string;
  readonly name: string;
  readonly subtype: AccountSubtype;
  /** Required on balance sheet accounts; null on income and expense accounts. */
  readonly cashFlowCategory: CashFlowCategory | null;
  readonly systemKey?: SystemAccountKey;
  readonly parentCode?: string;
  readonly description?: string;
}

export interface CoaTemplate {
  readonly key: CoaTemplateKey;
  readonly name: string;
  readonly description: string;
  readonly accounts: readonly TemplateAccount[];
}

const a = (
  code: string,
  name: string,
  subtype: AccountSubtype,
  cashFlowCategory: CashFlowCategory | null,
  extra: Pick<TemplateAccount, "systemKey" | "parentCode" | "description"> = {},
): TemplateAccount => ({ code, name, subtype, cashFlowCategory, ...extra });

const OWC = "operating_working_capital";

/** Balance sheet and system accounts shared by every template (SPEC §4.2). */
const CORE_BALANCE_SHEET: TemplateAccount[] = [
  a("1000", "Cash and bank", "current_asset", "cash", { description: "Group for bank and cash accounts" }),
  a("1010", "Cash on hand", "cash", "cash", { parentCode: "1000" }),
  a("1020", "Main bank account", "bank", "cash", { parentCode: "1000" }),
  a("1100", "Accounts receivable", "receivable", OWC, { systemKey: "accounts_receivable", description: "Money customers owe you" }),
  a("1150", "Other receivables", "receivable", OWC),
  a("1300", "Prepayments", "current_asset", OWC, { description: "Rent, insurance and other costs paid in advance" }),
  a("1310", "Staff advances", "current_asset", OWC),
  a("1400", "VAT input (recoverable)", "current_asset", OWC, { systemKey: "vat_input" }),
  a("1410", "WHT receivable (credit notes)", "current_asset", OWC, { systemKey: "wht_receivable", description: "Tax customers withheld from your payments" }),
  a("1500", "Property, plant and equipment", "non_current_asset", "investing", { description: "Group for fixed assets" }),
  a("1510", "Land and buildings", "non_current_asset", "investing", { parentCode: "1500" }),
  a("1520", "Furniture and fittings", "non_current_asset", "investing", { parentCode: "1500" }),
  a("1530", "Motor vehicles", "non_current_asset", "investing", { parentCode: "1500" }),
  a("1540", "Computers and office equipment", "non_current_asset", "investing", { parentCode: "1500" }),
  a("1550", "Plant and machinery", "non_current_asset", "investing", { parentCode: "1500" }),
  a("1590", "Accumulated depreciation", "non_current_asset", "none", {
    parentCode: "1500",
    description: "Contra asset. Movements are non-cash and are added back in the cash flow statement.",
  }),
  a("1900", "Suspense", "current_asset", OWC, { systemKey: "suspense", description: "Temporary holding for items not yet classified. Should be zero." }),

  a("2000", "Accounts payable", "payable", OWC, { systemKey: "accounts_payable", description: "Money you owe suppliers" }),
  a("2050", "Accrued expenses", "current_liability", OWC),
  a("2100", "VAT output", "tax_payable", OWC, { systemKey: "vat_output" }),
  a("2110", "WHT payable", "tax_payable", OWC, { systemKey: "wht_payable", description: "Tax withheld from suppliers, due to the tax authority" }),
  a("2120", "PAYE payable", "tax_payable", OWC),
  a("2130", "Pension contributions payable", "current_liability", OWC),
  a("2140", "Company income tax payable", "tax_payable", OWC),
  a("2200", "Customer deposits", "current_liability", OWC),
  a("2300", "Short-term loans and overdrafts", "current_liability", "financing"),
  a("2310", "Directors' current account", "current_liability", "financing"),
  a("2500", "Long-term loans", "non_current_liability", "financing"),

  a("3000", "Owner's capital", "equity_capital", "financing", { description: "Share capital or money the owners put in" }),
  a("3100", "Retained earnings", "retained_earnings", "none", { systemKey: "retained_earnings" }),
  a("3200", "Drawings", "drawings", "financing", { description: "Money the owners took out" }),
  a("3900", "Opening balance equity", "equity_capital", "none", {
    systemKey: "opening_balance_equity",
    description: "Balancing figure for opening balances. Should be zero once set-up is complete.",
  }),
];

/** Operating expenses common to every template (6000–7999). */
const CORE_EXPENSES: TemplateAccount[] = [
  a("6000", "Salaries and wages", "operating_expense", null),
  a("6010", "Staff pension contributions", "operating_expense", null),
  a("6020", "Staff welfare", "operating_expense", null),
  a("6100", "Rent", "operating_expense", null),
  a("6110", "Electricity", "operating_expense", null),
  a("6120", "Diesel and generator", "operating_expense", null),
  a("6130", "Water", "operating_expense", null),
  a("6200", "Fuel and transport", "operating_expense", null),
  a("6210", "Vehicle repairs and maintenance", "operating_expense", null),
  a("6300", "Telephone and internet", "operating_expense", null),
  a("6310", "Software and subscriptions", "operating_expense", null),
  a("6400", "Office supplies and stationery", "operating_expense", null),
  a("6500", "Repairs and maintenance", "operating_expense", null),
  a("6600", "Advertising and marketing", "operating_expense", null),
  a("6700", "Professional fees", "operating_expense", null),
  a("6710", "Audit and accounting fees", "operating_expense", null),
  a("6720", "Legal fees", "operating_expense", null),
  a("6800", "Bank charges", "operating_expense", null),
  a("6810", "Insurance", "operating_expense", null),
  a("6900", "Travel", "operating_expense", null),
  a("6910", "Meals and entertainment", "operating_expense", null),
  a("7000", "Training", "operating_expense", null),
  a("7100", "Depreciation", "operating_expense", null),
  a("7200", "Security", "operating_expense", null),
  a("7300", "Cleaning and sanitation", "operating_expense", null),
  a("7400", "Licences, permits and levies", "operating_expense", null),
  a("7500", "Donations", "operating_expense", null),
  a("7900", "General expenses", "operating_expense", null),
];

/** Other income and expense, finance costs and tax (8000–8999). */
const CORE_OTHER: TemplateAccount[] = [
  a("8000", "Other income", "other_income", null),
  a("8010", "Interest income", "other_income", null),
  a("8100", "Foreign exchange gain or loss", "other_income", null, { systemKey: "fx_gain_loss" }),
  a("8200", "Interest expense", "finance_cost", null),
  a("8210", "Loan charges", "finance_cost", null),
  a("8300", "Rounding", "operating_expense", null, { systemKey: "rounding", description: "Rounding residuals from tax and split calculations" }),
  a("8500", "Income tax expense", "income_tax_expense", null),
];

function template(key: CoaTemplateKey, name: string, description: string, specific: TemplateAccount[], omit: string[] = []): CoaTemplate {
  const all = [...CORE_BALANCE_SHEET, ...specific, ...CORE_EXPENSES, ...CORE_OTHER].filter((x) => !omit.includes(x.code));
  return { key, name, description, accounts: [...all].sort((x, y) => x.code.localeCompare(y.code)) };
}

export const COA_TEMPLATES: Readonly<Record<CoaTemplateKey, CoaTemplate>> = {
  general_sme: template("general_sme", "General SME", "A balanced starting point for most small businesses.", [
    a("1200", "Inventory", "inventory", OWC),
    a("4000", "Sales", "revenue", null),
    a("4100", "Service income", "revenue", null),
    a("5000", "Cost of sales", "cost_of_sales", null),
    a("5100", "Purchases", "cost_of_sales", null),
  ]),
  service: template("service", "Service business", "Agencies, consultancies, clinics and other businesses that sell time and expertise.", [
    a("4000", "Fees and service income", "revenue", null),
    a("4100", "Reimbursed expenses", "revenue", null),
    a("5000", "Direct costs", "cost_of_sales", null),
    a("5300", "Subcontractors", "cost_of_sales", null),
  ]),
  trading: template("trading", "Trading business", "Shops, distributors and importers that buy and resell goods.", [
    a("1200", "Inventory", "inventory", OWC),
    a("4000", "Sales", "revenue", null),
    a("4900", "Sales returns and discounts", "revenue", null, { description: "Enter as a debit (reduces sales)" }),
    a("5000", "Cost of sales", "cost_of_sales", null),
    a("5100", "Purchases", "cost_of_sales", null),
    a("5110", "Carriage inwards", "cost_of_sales", null),
    a("5120", "Import duties and clearing", "cost_of_sales", null),
  ]),
  school: template("school", "School", "Nursery, primary and secondary schools.", [
    a("2210", "Fees received in advance", "current_liability", OWC),
    a("4000", "Tuition fees", "revenue", null),
    a("4010", "Registration and admission fees", "revenue", null),
    a("4020", "Uniform and book sales", "revenue", null),
    a("4030", "Transport fees", "revenue", null),
    a("4040", "Boarding fees", "revenue", null),
    a("4050", "Examination fees", "revenue", null),
    a("5000", "Teaching staff salaries", "cost_of_sales", null),
    a("5010", "Teaching materials", "cost_of_sales", null),
    a("5020", "Examination expenses", "cost_of_sales", null),
    a("5030", "Feeding", "cost_of_sales", null),
  ]),
};

/** Structural checks every template (including firm custom templates) must pass. */
export function validateTemplate(accounts: readonly TemplateAccount[], requiredSystemKeys: readonly SystemAccountKey[]): string[] {
  const problems: string[] = [];
  const byCode = new Map(accounts.map((x) => [x.code, x]));
  if (byCode.size !== accounts.length) problems.push("Duplicate account codes");
  for (const key of requiredSystemKeys) {
    if (accounts.filter((x) => x.systemKey === key).length !== 1) problems.push(`System account ${key} must appear exactly once`);
  }
  for (const x of accounts) {
    const type = typeOfSubtype(x.subtype);
    if (isBalanceSheetType(type) !== (x.cashFlowCategory !== null)) problems.push(`${x.code}: cash flow category is required on, and only on, balance sheet accounts`);
    let depth = 1;
    let parent = x.parentCode ? byCode.get(x.parentCode) : undefined;
    if (x.parentCode && !parent) problems.push(`${x.code}: parent ${x.parentCode} not found`);
    while (parent) {
      depth++;
      if (typeOfSubtype(parent.subtype) !== type) problems.push(`${x.code}: parent ${parent.code} has a different type`);
      parent = parent.parentCode ? byCode.get(parent.parentCode) : undefined;
      if (depth > 3) {
        problems.push(`${x.code}: hierarchy deeper than 3 levels`);
        break;
      }
    }
  }
  return problems;
}

/** Code ranges from SPEC §4.1, for validating codes users add. */
export function codeRangeFits(code: string, subtype: AccountSubtype): boolean {
  if (!/^\d{4}$/.test(code)) return false;
  const n = Number(code);
  switch (typeOfSubtype(subtype)) {
    case "asset":
      return n >= 1000 && n <= 1999;
    case "liability":
      return n >= 2000 && n <= 2999;
    case "equity":
      return n >= 3000 && n <= 3999;
    case "income":
      return (n >= 4000 && n <= 4999) || (n >= 8000 && n <= 8999);
    case "expense":
      return n >= 5000 && n <= 8999;
  }
}
