import { DomainError, ValidationError } from "../errors";
import { PeriodLockedError, PeriodNotFoundError } from "../ledger/errors";
import { addDays, addMonths, daysInMonth, formatIsoDate, parseIsoDate, type IsoDate } from "./dates";

export const PERIOD_STATUSES = ["open", "locked", "closed"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export interface PeriodInfo {
  readonly id: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly status: PeriodStatus;
}

export interface DateRange {
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
}

/** The fiscal year containing `date`, for a year starting in `startMonth` (1–12). */
export function fiscalYearContaining(date: IsoDate, startMonth: number): DateRange {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) throw new RangeError(`Invalid fiscal year start month ${startMonth}`);
  const { y, m } = parseIsoDate(date);
  const startYear = m >= startMonth ? y : y - 1;
  return fiscalYearStarting(startYear, startMonth);
}

export function fiscalYearStarting(year: number, startMonth: number): DateRange {
  const end = addMonths(year, startMonth, 11);
  return { startDate: formatIsoDate(year, startMonth, 1), endDate: formatIsoDate(end.y, end.m, daysInMonth(end.y, end.m)) };
}

/** The twelve calendar-month periods of a fiscal year (SPEC §4.5). */
export function monthlyPeriods(fiscalYear: DateRange): DateRange[] {
  const { y, m } = parseIsoDate(fiscalYear.startDate);
  return Array.from({ length: 12 }, (_, i) => {
    const p = addMonths(y, m, i);
    return { startDate: formatIsoDate(p.y, p.m, 1), endDate: formatIsoDate(p.y, p.m, daysInMonth(p.y, p.m)) };
  });
}

/** Fiscal year label used in journal numbers: the calendar year in which it ends. */
export function fiscalYearLabel(fiscalYear: DateRange): string {
  return fiscalYear.endDate.slice(0, 4);
}

export function containsDate(range: DateRange, date: IsoDate): boolean {
  return date >= range.startDate && date <= range.endDate;
}

export function periodContaining<P extends DateRange>(periods: readonly P[], date: IsoDate): P | null {
  return periods.find((p) => containsDate(p, date)) ?? null;
}

/** Rule 5: nothing posts into a locked or closed period, or outside any period. */
export function assertDateInPostablePeriod(date: IsoDate, period: PeriodInfo | null): void {
  if (!period || !containsDate(period, date)) throw new PeriodNotFoundError(date);
  switch (period.status) {
    case "open":
      return;
    case "locked":
    case "closed":
      throw new PeriodLockedError(date, period.status);
    default: {
      const unreachable: never = period.status;
      throw unreachable;
    }
  }
}

/**
 * Date for a reversal (SPEC §4.3): the original date if its period is open,
 * otherwise the first day of the first open period after it.
 */
export function reversalDate(originalDate: IsoDate, periods: readonly PeriodInfo[]): IsoDate {
  const sorted = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const own = periodContaining(sorted, originalDate);
  if (own?.status === "open") return originalDate;
  const next = sorted.find((p) => p.startDate > originalDate && p.status === "open");
  if (!next) throw new PeriodNotFoundError(originalDate);
  return next.startDate;
}

export class ReasonRequiredError extends ValidationError {
  constructor(what: string) {
    super(`Give a reason to ${what}`, [{ path: "reason", message: "Required" }]);
  }
}

export class PeriodStatusError extends DomainError {
  readonly code = "period_status";
}

/** Locking needs an open period; a reason is optional but recorded. */
export function assertCanLock(period: PeriodInfo): void {
  if (period.status !== "open") throw new PeriodStatusError(`This period is already ${period.status}`);
}

/** Unlocking needs a locked (not closed) period and a written reason (SPEC §4.5). */
export function assertCanUnlock(period: PeriodInfo, reason: string): void {
  if (period.status === "closed") throw new PeriodStatusError("Closed periods are reopened by reopening the year, not unlocked");
  if (period.status !== "locked") throw new PeriodStatusError("This period is not locked");
  if (!reason.trim()) throw new ReasonRequiredError("unlock this period");
}

/** Day before go-live: the date opening balances are posted on (SPEC §4.8). */
export function openingBalanceDate(goLiveDate: IsoDate): IsoDate {
  return addDays(goLiveDate, -1);
}
