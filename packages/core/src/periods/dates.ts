/**
 * Civil-date helpers for accounting dates (YYYY-MM-DD, no time; rule 11).
 * Pure integer arithmetic: no Date objects, so no timezone can shift a day.
 */

export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(d: IsoDate): { y: number; m: number; day: number } {
  const match = ISO_DATE.exec(d);
  if (!match) throw new RangeError(`Invalid date: ${d}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const day = Number(match[3]);
  if (m < 1 || m > 12 || day < 1 || day > daysInMonth(y, m)) throw new RangeError(`Invalid date: ${d}`);
  return { y, m, day };
}

export function isIsoDate(d: string): boolean {
  try {
    parseIsoDate(d);
    return true;
  } catch {
    return false;
  }
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
}

export function formatIsoDate(y: number, m: number, day: number): IsoDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Adds whole months, keeping the first of the month on the first. */
export function addMonths(y: number, m: number, months: number): { y: number; m: number } {
  const index = y * 12 + (m - 1) + months;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

export function addDays(d: IsoDate, days: number): IsoDate {
  // Convert through a day number (days since 0000-03-01) for exact arithmetic.
  const n = toDayNumber(d) + days;
  return fromDayNumber(n);
}

function toDayNumber(d: IsoDate): number {
  const { y, m, day } = parseIsoDate(d);
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe;
}

function fromDayNumber(n: number): IsoDate {
  const era = Math.floor(n / 146097);
  const doe = n - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return formatIsoDate(y, m, day);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * Today's accounting date in the entity's timezone (rule 11). Never derive an
 * accounting date from a UTC timestamp any other way.
 */
export function dateInTimezone(instant: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
