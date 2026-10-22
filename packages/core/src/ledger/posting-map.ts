/**
 * THE posting map (SPEC §4.4, CLAUDE.md rule 12). Every simple-mode
 * transaction compiles to a journal entry here and nowhere else. Each row has
 * a unit test asserting its exact debits and credits.
 *
 * Phase 4 rows (customer pays an invoice, we pay a bill) arrive with invoices.
 */
import { DomainError } from "../errors";
import { splitInclusive, taxOnNet } from "../money/tax-math";
import type { IsoDate } from "../periods/dates";
import type { TaxCode } from "../tax/tax-codes";
import type { AccountSubtype, AccountType, LedgerAccount } from "./accounts";
import { creditLine, debitLine, type EntryDraft, type EntryLine } from "./entry";

export const TRANSACTION_KINDS = ["money_in", "money_out", "transfer", "owner_in", "owner_out", "loan_in", "loan_repay"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export interface TransactionInput {
  readonly kind: TransactionKind;
  readonly txnDate: IsoDate;
  /**
   * Money in/out: the transaction value, including VAT when `amountsIncludeTax`
   * is true, excluding it otherwise. Before any WHT deduction.
   * Transfers, owner and loan movements: the amount that moved.
   * Loan repayment: the total paid (principal + interest).
   */
  readonly amount: bigint;
  /** The bank or cash ledger account money moves through (the source, for transfers). */
  readonly bankAccountId: string;
  /**
   * The other side: income (money in), expense (money out), destination bank
   * (transfer), owner's capital, drawings, or loan liability.
   */
  readonly counterAccountId: string;
  readonly amountsIncludeTax?: boolean;
  readonly vat?: TaxCode | null;
  readonly wht?: TaxCode | null;
  /** Loan repayment only: the interest part, posted to `interestAccountId`. */
  readonly interest?: bigint;
  readonly interestAccountId?: string | null;
  readonly contactId?: string | null;
  readonly reference?: string | null;
  readonly memo?: string | null;
  readonly transactionId?: string | null;
}

export interface TransactionBreakdown {
  /** Amount excluding VAT. */
  readonly net: bigint;
  readonly vat: bigint;
  readonly wht: bigint;
  /** What actually moved through the bank account. */
  readonly bank: bigint;
}

export interface CompiledTransaction {
  readonly draft: EntryDraft;
  readonly breakdown: TransactionBreakdown;
}

export class InvalidTransactionError extends DomainError {
  readonly code = "invalid_transaction";

  constructor(
    message: string,
    readonly field: string | null = null,
  ) {
    super(message);
  }
}

const LABELS: Record<TransactionKind, string> = {
  money_in: "Money in",
  money_out: "Money out",
  transfer: "Transfer",
  owner_in: "Owner put money in",
  owner_out: "Owner took money out",
  loan_in: "Loan received",
  loan_repay: "Loan repayment",
};

function account(accounts: ReadonlyMap<string, LedgerAccount>, id: string | null | undefined, field: string): LedgerAccount {
  const a = id ? accounts.get(id) : undefined;
  if (!a) throw new InvalidTransactionError("Choose an account", field);
  return a;
}

function expectAccount(a: LedgerAccount, field: string, types: readonly AccountType[], subtypes: readonly AccountSubtype[] | null, what: string): void {
  if (!types.includes(a.type) || (subtypes !== null && !subtypes.includes(a.subtype))) {
    throw new InvalidTransactionError(`${a.name} is not ${what}`, field);
  }
}

const BANK_SUBTYPES: readonly AccountSubtype[] = ["bank", "cash"];

function taxLinkedAccount(code: TaxCode, which: "output" | "input"): string {
  const id = which === "output" ? code.outputAccountId : code.inputAccountId;
  if (!id) throw new InvalidTransactionError(`Tax code ${code.name} has no linked ${which} account`, code.kind);
  return id;
}

function assertTaxCode(code: TaxCode, kind: "vat" | "wht", side: "sales" | "purchases", date: IsoDate): void {
  if (code.kind !== kind) throw new InvalidTransactionError(`${code.name} is not a ${kind.toUpperCase()} code`, kind);
  if (code.appliesTo !== "both" && code.appliesTo !== side) throw new InvalidTransactionError(`${code.name} does not apply to ${side}`, kind);
  if (date < code.effectiveFrom || (code.effectiveTo !== null && date > code.effectiveTo)) {
    throw new InvalidTransactionError(`${code.name} is not in force on ${date}`, kind);
  }
}

/** VAT and WHT amounts for a sale or purchase (SPEC §4.4). WHT is computed on the amount excluding VAT. */
export function taxBreakdown(input: Pick<TransactionInput, "amount" | "amountsIncludeTax" | "vat" | "wht">): TransactionBreakdown {
  let net = input.amount;
  let vat = 0n;
  if (input.vat) {
    if (input.amountsIncludeTax) {
      const split = splitInclusive(input.amount, input.vat.rateBps);
      net = split.net;
      vat = split.tax;
    } else {
      vat = taxOnNet(net, input.vat.rateBps);
    }
  }
  const wht = input.wht ? taxOnNet(net, input.wht.rateBps) : 0n;
  return { net, vat, wht, bank: net + vat - wht };
}

/** Drops zero lines: a 0% VAT code or an interest-free repayment must not create a zero line (rule 2). */
function nonZero(lines: EntryLine[]): EntryLine[] {
  return lines.filter((l) => l.debit > 0n || l.credit > 0n);
}

export function compileTransaction(input: TransactionInput, accounts: ReadonlyMap<string, LedgerAccount>): CompiledTransaction {
  if (input.amount <= 0n) throw new InvalidTransactionError("Enter an amount greater than zero", "amount");
  const taxed = Boolean(input.vat || input.wht);
  if (taxed && input.kind !== "money_in" && input.kind !== "money_out") {
    throw new InvalidTransactionError("VAT and WHT only apply to money in and money out", "vat");
  }

  const bank = account(accounts, input.bankAccountId, "bankAccountId");
  expectAccount(bank, "bankAccountId", ["asset"], BANK_SUBTYPES, "a bank or cash account");
  const counter = account(accounts, input.counterAccountId, "counterAccountId");
  const contact = { contactId: input.contactId ?? null };
  const memo = input.memo?.trim() || [LABELS[input.kind], input.reference?.trim()].filter(Boolean).join(" · ");

  let lines: EntryLine[];
  let breakdown: TransactionBreakdown = { net: input.amount, vat: 0n, wht: 0n, bank: input.amount };

  switch (input.kind) {
    case "money_in": {
      expectAccount(counter, "counterAccountId", ["income"], null, "an income category");
      if (input.vat) assertTaxCode(input.vat, "vat", "sales", input.txnDate);
      if (input.wht) assertTaxCode(input.wht, "wht", "sales", input.txnDate);
      breakdown = taxBreakdown(input);
      if (breakdown.bank <= 0n) throw new InvalidTransactionError("The amount received must be more than the tax withheld", "amount");
      lines = [
        debitLine(bank.id, breakdown.bank, contact),
        ...(input.wht ? [debitLine(taxLinkedAccount(input.wht, "input"), breakdown.wht, { ...contact, taxCodeId: input.wht.id })] : []),
        creditLine(counter.id, breakdown.net, { ...contact, taxCodeId: input.vat?.id ?? null }),
        ...(input.vat ? [creditLine(taxLinkedAccount(input.vat, "output"), breakdown.vat, { ...contact, taxCodeId: input.vat.id })] : []),
      ];
      break;
    }
    case "money_out": {
      expectAccount(counter, "counterAccountId", ["expense"], null, "an expense category");
      if (input.vat) assertTaxCode(input.vat, "vat", "purchases", input.txnDate);
      if (input.wht) assertTaxCode(input.wht, "wht", "purchases", input.txnDate);
      breakdown = taxBreakdown(input);
      if (breakdown.bank <= 0n) throw new InvalidTransactionError("The amount paid must be more than the tax withheld", "amount");
      const recoverable = input.vat?.recoverable ?? false;
      lines = [
        debitLine(counter.id, recoverable ? breakdown.net : breakdown.net + breakdown.vat, { ...contact, taxCodeId: input.vat?.id ?? null }),
        ...(input.vat && recoverable ? [debitLine(taxLinkedAccount(input.vat, "input"), breakdown.vat, { ...contact, taxCodeId: input.vat.id })] : []),
        creditLine(bank.id, breakdown.bank, contact),
        ...(input.wht ? [creditLine(taxLinkedAccount(input.wht, "output"), breakdown.wht, { ...contact, taxCodeId: input.wht.id })] : []),
      ];
      break;
    }
    case "transfer": {
      expectAccount(counter, "counterAccountId", ["asset"], BANK_SUBTYPES, "a bank or cash account");
      if (counter.id === bank.id) throw new InvalidTransactionError("Choose two different accounts", "counterAccountId");
      lines = [debitLine(counter.id, input.amount), creditLine(bank.id, input.amount)];
      break;
    }
    case "owner_in": {
      expectAccount(counter, "counterAccountId", ["equity"], ["equity_capital"], "an owner's capital account");
      lines = [debitLine(bank.id, input.amount, contact), creditLine(counter.id, input.amount, contact)];
      break;
    }
    case "owner_out": {
      expectAccount(counter, "counterAccountId", ["equity"], ["drawings"], "a drawings account");
      lines = [debitLine(counter.id, input.amount, contact), creditLine(bank.id, input.amount, contact)];
      break;
    }
    case "loan_in": {
      expectAccount(counter, "counterAccountId", ["liability"], ["current_liability", "non_current_liability"], "a loan account");
      lines = [debitLine(bank.id, input.amount, contact), creditLine(counter.id, input.amount, contact)];
      break;
    }
    case "loan_repay": {
      expectAccount(counter, "counterAccountId", ["liability"], ["current_liability", "non_current_liability"], "a loan account");
      const interest = input.interest ?? 0n;
      if (interest < 0n || interest > input.amount) throw new InvalidTransactionError("Interest must be between zero and the amount paid", "interest");
      if (interest > 0n) {
        const interestAccount = account(accounts, input.interestAccountId, "interestAccountId");
        expectAccount(interestAccount, "interestAccountId", ["expense"], ["finance_cost"], "a finance cost account");
      }
      breakdown = { net: input.amount, vat: 0n, wht: 0n, bank: input.amount };
      lines = [
        debitLine(counter.id, input.amount - interest, contact),
        ...(interest > 0n && input.interestAccountId ? [debitLine(input.interestAccountId, interest, contact)] : []),
        creditLine(bank.id, input.amount, contact),
      ];
      break;
    }
    default: {
      const unreachable: never = input.kind;
      throw new InvalidTransactionError(`Unknown transaction kind ${String(unreachable)}`);
    }
  }

  return {
    draft: { entryDate: input.txnDate, memo, sourceType: "transaction", sourceId: input.transactionId ?? null, lines: nonZero(lines) },
    breakdown,
  };
}
