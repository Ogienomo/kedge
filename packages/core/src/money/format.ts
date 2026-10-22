import { DEFAULT_LOCALE } from "@kedge/config";
import { absMinor, CURRENCIES, type CurrencyCode } from "./money";

const SYMBOLS: Record<CurrencyCode, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

export interface FormatOptions {
  /** Negative amounts in parentheses, as in reports: (₦12,500.00). Default: minus sign. */
  readonly negative?: "minus" | "parentheses";
  /** Hide the currency symbol (e.g. in dense report columns). */
  readonly symbol?: boolean;
  /** Present in thousands (₦'000) for accountant-mode reports. */
  readonly thousands?: boolean;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * The shared money formatter: ₦1,234,567.89. Pure string arithmetic on the
 * bigint, so it is exact for any amount. Used only at the UI and export edge.
 */
export function formatMoney(minor: bigint, currency: CurrencyCode = "NGN", options: FormatOptions = {}): string {
  const exponent = CURRENCIES[currency];
  const negative = minor < 0n;
  let abs = absMinor(minor);
  let decimals: number = exponent;
  if (options.thousands) {
    // Round to whole thousands of the major unit, half away from zero.
    const unit = 1000n * 10n ** BigInt(exponent);
    abs = (abs * 2n + unit) / (unit * 2n);
    decimals = 0;
  }
  const s = abs.toString().padStart(decimals + 1, "0");
  const whole = decimals > 0 ? s.slice(0, -decimals) : s;
  const fraction = decimals > 0 ? `.${s.slice(-decimals)}` : "";
  const body = `${options.symbol === false ? "" : SYMBOLS[currency]}${group(whole)}${fraction}`;
  if (!negative || abs === 0n) return body;
  return options.negative === "parentheses" ? `(${body})` : `-${body}`;
}

/** Locale used for dates and counts alongside amounts. */
export const NUMBER_LOCALE = DEFAULT_LOCALE;
