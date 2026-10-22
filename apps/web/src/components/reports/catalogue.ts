import type { ReportKey } from "@kedge/api";

export interface ReportInfo {
  key: ReportKey;
  title: string;
  simpleTitle: string;
  description: string;
  simpleDescription: string;
  /** Point-in-time reports take "as at"; others a date range. */
  kind: "asOf" | "range";
  accountantOnly?: boolean;
}

/** SPEC §9.2 Phase 1 reports. */
export const REPORTS: ReportInfo[] = [
  { key: "income-statement", title: "Income statement", simpleTitle: "Profit and loss", description: "Revenue, costs and profit for a period.", simpleDescription: "What you earned, what you spent, and what is left.", kind: "range" },
  { key: "balance-sheet", title: "Balance sheet", simpleTitle: "What you own and owe", description: "Statement of financial position at a date.", simpleDescription: "Everything the business owns and owes on one day.", kind: "asOf" },
  { key: "expense-by-category", title: "Expenses by category", simpleTitle: "Where money went", description: "Expenses for a period, largest first.", simpleDescription: "Your spending, biggest categories first.", kind: "range" },
  { key: "income-by-source", title: "Income by source", simpleTitle: "Where money came from", description: "Income for a period, largest first.", simpleDescription: "Your earnings by category.", kind: "range" },
  { key: "trial-balance", title: "Trial balance", simpleTitle: "Trial balance", description: "Every account's balance at a date; debits equal credits.", simpleDescription: "Every account's balance at a date.", kind: "asOf", accountantOnly: true },
  { key: "general-ledger", title: "General ledger", simpleTitle: "General ledger", description: "Every line per account with running balances.", simpleDescription: "Every line per account.", kind: "range", accountantOnly: true },
  { key: "journal", title: "Journal report", simpleTitle: "Journal report", description: "All entries for a period with their lines.", simpleDescription: "All entries for a period.", kind: "range", accountantOnly: true },
];

export function reportInfo(key: string): ReportInfo | undefined {
  return REPORTS.find((r) => r.key === key);
}
