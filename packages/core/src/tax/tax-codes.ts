import { DomainError } from "../errors";
import type { IsoDate } from "../periods/dates";

export const TAX_KINDS = ["vat", "wht"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];

export const TAX_APPLIES_TO = ["sales", "purchases", "both"] as const;
export type TaxAppliesTo = (typeof TAX_APPLIES_TO)[number];

/**
 * One version of a tax code (SPEC §4.7). Versions of the same code share a
 * `codeKey`; a rate change is a new version with a new `effectiveFrom`.
 *
 * Linked accounts:
 * - VAT: `outputAccountId` = VAT output (sales), `inputAccountId` = VAT input (purchases).
 * - WHT: `outputAccountId` = WHT payable (we deducted from a supplier),
 *        `inputAccountId` = WHT receivable (a customer deducted from us).
 */
export interface TaxCode {
  readonly id: string;
  readonly codeKey: string;
  readonly kind: TaxKind;
  readonly name: string;
  readonly rateBps: number;
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo: IsoDate | null;
  readonly appliesTo: TaxAppliesTo;
  readonly recoverable: boolean;
  readonly outputAccountId: string | null;
  readonly inputAccountId: string | null;
}

export class TaxCodeNotInForceError extends DomainError {
  readonly code = "tax_code_not_in_force";

  constructor(
    readonly codeKey: string,
    readonly date: IsoDate,
  ) {
    super(`No version of tax code ${codeKey} is in force on ${date}`);
  }
}

export function isInForce(code: Pick<TaxCode, "effectiveFrom" | "effectiveTo">, date: IsoDate): boolean {
  return date >= code.effectiveFrom && (code.effectiveTo === null || date <= code.effectiveTo);
}

/** The version of a code in force on `date` (AC-3.6 builds on this). */
export function taxCodeInForce(versions: readonly TaxCode[], codeKey: string, date: IsoDate): TaxCode {
  const matches = versions.filter((v) => v.codeKey === codeKey && isInForce(v, date));
  if (matches.length !== 1) throw new TaxCodeNotInForceError(codeKey, date);
  return matches[0] as TaxCode;
}

/** Versions of one code must not overlap in time. */
export function assertNoOverlap(versions: readonly Pick<TaxCode, "codeKey" | "effectiveFrom" | "effectiveTo">[]): void {
  const byKey = new Map<string, typeof versions>();
  for (const v of versions) byKey.set(v.codeKey, [...(byKey.get(v.codeKey) ?? []), v]);
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev && cur && (prev.effectiveTo === null || prev.effectiveTo >= cur.effectiveFrom)) {
        throw new RangeError(`Tax code ${key} has overlapping versions`);
      }
    }
  }
}
