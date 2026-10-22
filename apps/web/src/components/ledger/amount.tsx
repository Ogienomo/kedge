import { formatMoney } from "@kedge/core";
import { cn } from "@kedge/ui";

/**
 * Money at the UI edge (rule 4): exact formatting from minor units, tabular
 * figures, right-aligned. Reports show negatives in parentheses.
 */
export function Amount({
  minor,
  className,
  negative = "parentheses",
  muteZero = false,
  symbol = true,
}: {
  minor: string | bigint;
  className?: string;
  negative?: "parentheses" | "minus";
  muteZero?: boolean;
  symbol?: boolean;
}) {
  const v = typeof minor === "bigint" ? minor : BigInt(minor);
  return <span className={cn("amount", v < 0n && "text-danger", v === 0n && muteZero && "text-muted", className)}>{formatMoney(v, "NGN", { negative, symbol })}</span>;
}

export function formatNaira(minor: string | bigint, negative: "parentheses" | "minus" = "minus"): string {
  return formatMoney(typeof minor === "bigint" ? minor : BigInt(minor), "NGN", { negative });
}

const dateFmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Accounting dates are plain dates: format without any timezone shift (rule 11). */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}
