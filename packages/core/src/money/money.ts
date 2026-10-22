import { ValidationError } from "../errors";

/** ISO 4217 currencies the product knows, with their minor-unit exponents (SPEC §4.6). */
export const CURRENCIES = { NGN: 2, USD: 2, GBP: 2, EUR: 2 } as const;
export type CurrencyCode = keyof typeof CURRENCIES;

export function isCurrencyCode(code: string): code is CurrencyCode {
  return Object.hasOwn(CURRENCIES, code);
}

/**
 * An amount in integer minor units (kobo for NGN) with its currency. Never a
 * float: every operation is bigint arithmetic (CLAUDE.md rule 4).
 */
export interface Money {
  readonly minor: bigint;
  readonly currency: CurrencyCode;
}

export class CurrencyMismatchError extends ValidationError {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Cannot combine ${a} and ${b} amounts`);
  }
}

export function money(minor: bigint, currency: CurrencyCode = "NGN"): Money {
  return { minor, currency };
}

function same(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  same(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  same(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.minor, a.currency);
}

export function isZero(a: Money): boolean {
  return a.minor === 0n;
}

export function sumMinor(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

export function absMinor(v: bigint): bigint {
  return v < 0n ? -v : v;
}

/**
 * The one rounding function (CLAUDE.md rule 4): numerator / denominator,
 * rounded half away from zero. Every tax, split and conversion goes through it.
 */
export function roundMinor(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("roundMinor: division by zero");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const q = n / denominator;
  const r = n % denominator;
  const rounded = r * 2n >= denominator ? q + 1n : q;
  return negative ? -rounded : rounded;
}

const MINOR_STRING = /^-?(0|[1-9]\d*)$/;

/** Parses the API wire format: a string of integer minor units ("123456"). */
export function parseMinor(value: string): bigint {
  if (!MINOR_STRING.test(value) || value === "-0") throw new ValidationError(`Invalid amount: expected integer minor units, got "${value}"`);
  return BigInt(value);
}

/** Serialises minor units for the API wire format. */
export function toMinorString(value: bigint): string {
  return value.toString();
}

/**
 * Parses what a person typed ("1,234.56", "₦ 1 234.5", "-20") into minor
 * units without ever going through floating point. Returns null if invalid.
 */
export function parseAmountInput(input: string, currency: CurrencyCode = "NGN"): bigint | null {
  const exponent = CURRENCIES[currency];
  const cleaned = input.replace(/[₦\s,]/g, "").replace(/^\((.*)\)$/, "-$1");
  const match = /^(-)?(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, whole = "0", fraction = ""] = match;
  if (fraction.length > exponent) return null;
  const minor = BigInt(whole) * 10n ** BigInt(exponent) + BigInt(fraction.padEnd(exponent, "0") || "0");
  return sign ? -minor : minor;
}
