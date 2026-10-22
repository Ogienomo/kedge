import { DomainError } from "../errors";
import { absMinor } from "../money/money";
import type { PeriodInfo } from "../periods/periods";
import { assertDateInPostablePeriod } from "../periods/periods";
import type { LedgerAccount } from "./accounts";
import { AccountNotPostableError, InvalidEntryError, UnbalancedEntryError } from "./errors";

export const SOURCE_TYPES = [
  "manual",
  "transaction",
  "invoice",
  "bill",
  "payment",
  "statement_import",
  "opening_balance",
  "year_end_close",
  "reversal",
  "fx_revaluation",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface EntryLine {
  readonly accountId: string;
  /** Exactly one of debit/credit is positive; the other is zero (rule 2). */
  readonly debit: bigint;
  readonly credit: bigint;
  readonly contactId?: string | null;
  readonly taxCodeId?: string | null;
  readonly description?: string | null;
}

export interface EntryDraft {
  /** Accounting date, YYYY-MM-DD, no time (rule 11). */
  readonly entryDate: string;
  readonly memo: string;
  readonly sourceType: SourceType;
  readonly sourceId?: string | null;
  readonly lines: readonly EntryLine[];
}

export function debitLine(accountId: string, amount: bigint, extra: Omit<EntryLine, "accountId" | "debit" | "credit"> = {}): EntryLine {
  return { accountId, debit: amount, credit: 0n, ...extra };
}

export function creditLine(accountId: string, amount: bigint, extra: Omit<EntryLine, "accountId" | "debit" | "credit"> = {}): EntryLine {
  return { accountId, debit: 0n, credit: amount, ...extra };
}

export function entryTotals(lines: readonly EntryLine[]): { debit: bigint; credit: bigint } {
  let debit = 0n;
  let credit = 0n;
  for (const l of lines) {
    debit += l.debit;
    credit += l.credit;
  }
  return { debit, credit };
}

/** Line-level rule 2: exactly one positive amount, on one side. */
export function assertLineShape(line: EntryLine, lineNo: number): void {
  const debitSet = line.debit > 0n;
  const creditSet = line.credit > 0n;
  if (line.debit < 0n || line.credit < 0n) throw new InvalidEntryError(`Line ${lineNo}: amounts cannot be negative`, lineNo);
  if (debitSet === creditSet) {
    throw new InvalidEntryError(
      debitSet ? `Line ${lineNo}: enter a debit or a credit, not both` : `Line ${lineNo}: enter an amount greater than zero`,
      lineNo,
    );
  }
}

export interface PostingContext {
  readonly accounts: ReadonlyMap<string, LedgerAccount>;
  /** The period containing the entry date, or null if none exists. */
  readonly period: PeriodInfo | null;
}

/**
 * Every rule an entry must satisfy to be posted (rules 1, 2 and 5, plus
 * active leaf accounts). The database enforces the same rules again.
 */
export function validateForPosting(draft: EntryDraft, ctx: PostingContext): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.entryDate)) throw new InvalidEntryError("Entry date must be a date (YYYY-MM-DD)");
  if (draft.lines.length < 2) throw new InvalidEntryError("An entry needs at least two lines");

  draft.lines.forEach((line, i) => {
    assertLineShape(line, i + 1);
    const account = ctx.accounts.get(line.accountId);
    if (!account) throw new AccountNotPostableError(line.accountId, "unknown");
    if (!account.isActive) throw new AccountNotPostableError(line.accountId, "inactive");
    if (!account.isLeaf) throw new AccountNotPostableError(line.accountId, "not_leaf");
  });

  const totals = entryTotals(draft.lines);
  if (totals.debit !== totals.credit) throw new UnbalancedEntryError(totals.debit, totals.credit);

  assertDateInPostablePeriod(draft.entryDate, ctx.period);
}

/** The draft-time difference shown live in the journal editor. */
export function entryDifference(lines: readonly EntryLine[]): bigint {
  const t = entryTotals(lines);
  return absMinor(t.debit - t.credit);
}

export class ReversalReasonRequiredError extends DomainError {
  readonly code = "reason_required";

  constructor() {
    super("Give a reason for the reversal");
  }
}

export class AlreadyReversedError extends DomainError {
  readonly code = "already_reversed";

  constructor() {
    super("This entry has already been reversed");
  }
}

export interface PostedEntry {
  readonly id: string;
  readonly entryDate: string;
  readonly memo: string;
  readonly number: string;
  readonly reversedByEntryId: string | null;
  readonly sourceType: SourceType;
  readonly lines: readonly EntryLine[];
}

/**
 * The reversal of a posted entry (rule 3): same lines with debits and credits
 * swapped, dated `date` (the original date, or the first open date after it
 * when that period is no longer open — see `reversalDate`).
 */
export function buildReversal(original: PostedEntry, reason: string, date: string): EntryDraft {
  if (!reason.trim()) throw new ReversalReasonRequiredError();
  if (original.reversedByEntryId !== null) throw new AlreadyReversedError();
  if (original.sourceType === "reversal") throw new InvalidEntryError("A reversal cannot itself be reversed. Post a new entry instead.");
  return {
    entryDate: date,
    memo: `Reversal of ${original.number}: ${reason.trim()}`,
    sourceType: "reversal",
    sourceId: original.id,
    lines: original.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  };
}
