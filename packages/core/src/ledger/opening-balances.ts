import { InvalidEntryError } from "./errors";
import { isBalanceSheetType, type LedgerAccount } from "./accounts";
import { creditLine, debitLine, type EntryDraft, type EntryLine } from "./entry";
import { openingBalanceDate } from "../periods/periods";
import type { IsoDate } from "../periods/dates";

export interface OpeningBalance {
  readonly accountId: string;
  readonly debit: bigint;
  readonly credit: bigint;
}

/**
 * SPEC §4.8: one `opening_balance` entry dated the day before go-live, with
 * any difference sent to opening balance equity. Only balance sheet accounts
 * take opening balances.
 */
export function buildOpeningBalanceEntry(opts: {
  goLiveDate: IsoDate;
  balances: readonly OpeningBalance[];
  accounts: ReadonlyMap<string, LedgerAccount>;
  openingBalanceEquityAccountId: string;
}): EntryDraft {
  const lines: EntryLine[] = [];
  let net = 0n;
  const seen = new Set<string>();
  opts.balances.forEach((b, i) => {
    const lineNo = i + 1;
    const account = opts.accounts.get(b.accountId);
    if (!account) throw new InvalidEntryError(`Line ${lineNo}: unknown account`, lineNo);
    if (!isBalanceSheetType(account.type)) throw new InvalidEntryError(`${account.name}: opening balances are for balance sheet accounts only`, lineNo);
    if (account.id === opts.openingBalanceEquityAccountId) throw new InvalidEntryError("Opening balance equity is calculated, not entered", lineNo);
    if (seen.has(account.id)) throw new InvalidEntryError(`${account.name} appears twice`, lineNo);
    seen.add(account.id);
    if (b.debit < 0n || b.credit < 0n || (b.debit > 0n && b.credit > 0n)) throw new InvalidEntryError(`${account.name}: enter a debit or a credit balance`, lineNo);
    if (b.debit === 0n && b.credit === 0n) return;
    lines.push(b.debit > 0n ? debitLine(account.id, b.debit) : creditLine(account.id, b.credit));
    net += b.debit - b.credit;
  });
  if (lines.length === 0) throw new InvalidEntryError("Enter at least one opening balance");
  if (net > 0n) lines.push(creditLine(opts.openingBalanceEquityAccountId, net, { description: "Balancing figure" }));
  if (net < 0n) lines.push(debitLine(opts.openingBalanceEquityAccountId, -net, { description: "Balancing figure" }));

  return { entryDate: openingBalanceDate(opts.goLiveDate), memo: "Opening balances", sourceType: "opening_balance", lines };
}
