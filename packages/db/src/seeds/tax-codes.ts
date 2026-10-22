/**
 * Default tax codes seeded for every new entity (SPEC §4.7).
 *
 * VERIFY BEFORE LAUNCH: these rates are data, not code (rule 10). Every
 * seeded code is created unverified (`verified_by` null) and the UI flags it
 * until a qualified tax adviser confirms it. Nigeria's 2025 tax reform acts
 * change several rules; confirm current rates and effective dates.
 *
 * WHT codes are deliberately NOT seeded with rates: only category names are
 * provided, and a user enters and verifies each rate (SPEC §4.7).
 */
export interface SeedTaxCode {
  readonly codeKey: string;
  readonly kind: "vat";
  readonly name: string;
  readonly rateBps: number;
  readonly effectiveFrom: string;
  readonly appliesTo: "sales" | "purchases" | "both";
  readonly recoverable: boolean;
}

export const SEED_VAT_CODES: readonly SeedTaxCode[] = [
  // Standard rate 7.5% from 1 February 2020 (Finance Act 2019). Verify before launch.
  { codeKey: "VAT_STANDARD", kind: "vat", name: "VAT standard rate", rateBps: 750, effectiveFrom: "2020-02-01", appliesTo: "both", recoverable: true },
  { codeKey: "VAT_ZERO", kind: "vat", name: "VAT zero-rated", rateBps: 0, effectiveFrom: "2020-02-01", appliesTo: "both", recoverable: true },
  { codeKey: "VAT_EXEMPT", kind: "vat", name: "VAT exempt", rateBps: 0, effectiveFrom: "2020-02-01", appliesTo: "both", recoverable: false },
];

/** WHT categories offered when a user adds a WHT code. Rates are entered and verified by the user. */
export const WHT_CATEGORIES: readonly string[] = [
  "Contracts and supplies",
  "Consultancy, technical and management services",
  "Professional fees",
  "Rent",
  "Commission",
  "Construction",
  "Directors' fees",
  "Dividends",
  "Interest",
  "Royalties",
];
