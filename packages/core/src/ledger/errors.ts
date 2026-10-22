import { DomainError } from "../errors";

/** The entry's debits and credits differ (CLAUDE.md rule 1). */
export class UnbalancedEntryError extends DomainError {
  readonly code = "unbalanced_entry";

  constructor(
    readonly totalDebit: bigint,
    readonly totalCredit: bigint,
  ) {
    super(`Entry does not balance: debits ${totalDebit} ≠ credits ${totalCredit} (minor units)`);
  }
}

/** A structural rule for entries or lines is broken (rule 2, minimum lines, missing data). */
export class InvalidEntryError extends DomainError {
  readonly code = "invalid_entry";

  constructor(
    message: string,
    readonly lineNo: number | null = null,
  ) {
    super(message);
  }
}

/** Nothing posts into a locked or closed period (CLAUDE.md rule 5). */
export class PeriodLockedError extends DomainError {
  readonly code = "period_locked";

  constructor(
    readonly entryDate: string,
    readonly status: "locked" | "closed",
  ) {
    super(`The period containing ${entryDate} is ${status}`);
  }
}

/** The date falls outside every fiscal year set up for the entity. */
export class PeriodNotFoundError extends DomainError {
  readonly code = "period_not_found";

  constructor(readonly entryDate: string) {
    super(`No accounting period covers ${entryDate}. Set up that fiscal year first.`);
  }
}

/** Posting to an inactive, non-leaf or unknown account. */
export class AccountNotPostableError extends DomainError {
  readonly code = "account_not_postable";

  constructor(
    readonly accountId: string,
    readonly reason: "inactive" | "not_leaf" | "unknown",
  ) {
    super(
      reason === "inactive"
        ? "This account is deactivated and cannot take new postings"
        : reason === "not_leaf"
          ? "Post to a sub-account, not a parent (header) account"
          : "Unknown account",
    );
  }
}

/** Posted entries are immutable (CLAUDE.md rule 3). */
export class EntryImmutableError extends DomainError {
  readonly code = "entry_immutable";

  constructor(message = "Posted entries cannot be changed. Reverse the entry instead.") {
    super(message);
  }
}
