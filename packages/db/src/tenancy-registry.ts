/**
 * Every table in the `public` schema must appear here exactly once. The
 * tenant-isolation test (AC-0.4) is generated from this list, and a test
 * fails CI when a table exists in the database but not in this registry.
 */
export const TENANT_TABLES = {
  organisations: { orgColumn: "id" },
  memberships: { orgColumn: "org_id" },
  entities: { orgColumn: "org_id" },
  entity_access: { orgColumn: "org_id" },
  user_entity_prefs: { orgColumn: "org_id" },
  invitations: { orgColumn: "org_id" },
  audit_log: { orgColumn: "org_id" },
  accounts: { orgColumn: "org_id" },
  fiscal_years: { orgColumn: "org_id" },
  periods: { orgColumn: "org_id" },
  contacts: { orgColumn: "org_id" },
  tax_codes: { orgColumn: "org_id" },
  journal_entries: { orgColumn: "org_id" },
  journal_lines: { orgColumn: "org_id" },
  number_sequences: { orgColumn: "org_id" },
  bank_accounts: { orgColumn: "org_id" },
  transactions: { orgColumn: "org_id" },
} as const satisfies Record<string, { orgColumn: string }>;

export type TenantTable = keyof typeof TENANT_TABLES;

/** Tables without an org scope, with the reason and how they are protected. */
export const NON_TENANT_TABLES = {
  users: "Global profile per auth user. Visible only to the user and to users who share an org or entity with them; covered by its own isolation test.",
} as const satisfies Record<string, string>;
