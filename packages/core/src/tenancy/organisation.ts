export const ORG_KINDS = ["firm", "business"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export const BILLING_STATUSES = ["trialing", "active", "past_due", "cancelled"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

/** Free trial length in days (SPEC §11). */
export const TRIAL_DAYS = 14;

export function trialEndsAt(now: Date): Date {
  return new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}
