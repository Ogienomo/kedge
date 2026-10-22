import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FixtureTxn } from "./generate";

const here = (f: string) => fileURLToPath(new URL(f, import.meta.url));

export interface GoldenDataset {
  readonly company: {
    legalName: string;
    tradingName: string;
    rcNumber: string;
    tin: string;
    vatRegistered: boolean;
    industry: string;
    fiscalYearStartMonth: number;
    goLiveDate: string;
    coaTemplate: "general_sme";
    bankAccounts: { bankName: string; accountName: string; kind: "current" }[];
    whtCode: { codeKey: string; name: string; rateBps: number; effectiveFrom: string };
  };
  readonly openingBalances: { code: string; debit: string; credit: string }[];
  readonly transactions: FixtureTxn[];
}

export interface GoldenExpected {
  readonly status: string;
  readonly trialBalance: { asOf: string; rows: { code: string; debit: string; credit: string }[]; totalDebit: string; totalCredit: string };
  readonly incomeStatement: Record<string, string>;
  readonly balanceSheet: Record<string, string>;
}

/** "Adaeze Catering Ltd" golden dataset (DRAFT expected figures; see generate.ts). */
export function loadAdaezeCatering(): { dataset: GoldenDataset; expected: GoldenExpected } {
  return {
    dataset: JSON.parse(readFileSync(here("./dataset.json"), "utf8")) as GoldenDataset,
    expected: JSON.parse(readFileSync(here("./expected.json"), "utf8")) as GoldenExpected,
  };
}
