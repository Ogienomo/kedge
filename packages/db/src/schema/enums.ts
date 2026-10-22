import {
  ACCOUNT_SUBTYPES,
  ACCOUNT_TYPES,
  BILLING_STATUSES,
  CASH_FLOW_CATEGORIES,
  DISPLAY_MODES,
  ENTITY_ROLES,
  INVITABLE_ROLES,
  ORG_KINDS,
  ORG_ROLES,
  PERIOD_STATUSES,
  PL_CATEGORIES,
  SOURCE_TYPES,
  SYSTEM_ACCOUNT_KEYS,
  TAX_APPLIES_TO,
  TAX_KINDS,
  TRANSACTION_KINDS,
} from "@kedge/core";
import { pgEnum } from "drizzle-orm/pg-core";

export const orgKind = pgEnum("org_kind", ORG_KINDS);
export const billingStatus = pgEnum("billing_status", BILLING_STATUSES);
export const orgRole = pgEnum("org_role", ORG_ROLES);
export const membershipStatus = pgEnum("membership_status", ["active", "suspended"]);
export const entityStatus = pgEnum("entity_status", ["active", "archived"]);
export const entityRole = pgEnum("entity_role", ENTITY_ROLES);
export const invitationRole = pgEnum("invitation_role", INVITABLE_ROLES);
export const displayMode = pgEnum("display_mode", DISPLAY_MODES);

// Phase 1: ledger

export const accountType = pgEnum("account_type", ACCOUNT_TYPES);
export const accountSubtype = pgEnum("account_subtype", ACCOUNT_SUBTYPES as [string, ...string[]]);
export const normalBalanceSide = pgEnum("normal_balance", ["debit", "credit"]);
export const systemAccountKey = pgEnum("system_account_key", SYSTEM_ACCOUNT_KEYS);
export const cashFlowCategory = pgEnum("cash_flow_category", CASH_FLOW_CATEGORIES);
export const plCategory = pgEnum("pl_category", PL_CATEGORIES);
export const fiscalYearStatus = pgEnum("fiscal_year_status", ["open", "closed"]);
export const periodStatus = pgEnum("period_status", PERIOD_STATUSES);
export const entryStatus = pgEnum("entry_status", ["draft", "posted"]);
export const sourceType = pgEnum("source_type", SOURCE_TYPES);
export const sequenceKind = pgEnum("sequence_kind", ["journal", "invoice", "bill"]);
export const contactKind = pgEnum("contact_kind", ["customer", "supplier", "both", "other"]);
export const transactionKind = pgEnum("transaction_kind", TRANSACTION_KINDS);
export const transactionStatus = pgEnum("transaction_status", ["draft", "posted", "reversed"]);
export const bankAccountKind = pgEnum("bank_account_kind", ["current", "savings", "wallet", "cash", "card"]);
export const taxKind = pgEnum("tax_kind", TAX_KINDS);
export const taxAppliesTo = pgEnum("tax_applies_to", TAX_APPLIES_TO);
