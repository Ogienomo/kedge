import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { billingStatus, displayMode, entityRole, entityStatus, invitationRole, membershipStatus, orgKind, orgRole } from "./enums";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** SPEC §5.1. The paying tenant. Its own `id` is the org scope. */
export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: orgKind("kind").notNull(),
  planCode: text("plan_code"),
  billingStatus: billingStatus("billing_status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  logoFileId: uuid("logo_file_id"),
  brandColour: text("brand_colour"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => authUsers.id),
  ...timestamps,
}).enableRLS();

/** Profile mirror of `auth.users`, maintained by a trigger on the auth table. */
export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  fullName: text("full_name"),
  phone: text("phone"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  locale: text("locale").notNull().default("en-NG"),
  ...timestamps,
}).enableRLS();

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull(),
    status: membershipStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    unique("memberships_org_user_key").on(t.orgId, t.userId),
    // Exactly one Org Owner per org (SPEC §3.2).
    uniqueIndex("memberships_one_owner_per_org").on(t.orgId).where(sql`${t.role} = 'org_owner'`),
  ],
).enableRLS();

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    tradingName: text("trading_name"),
    rcNumber: text("rc_number"),
    tin: text("tin"),
    vatRegistered: boolean("vat_registered").notNull().default(false),
    functionalCurrency: char("functional_currency", { length: 3 }).notNull().default("NGN"),
    fiscalYearStartMonth: smallint("fiscal_year_start_month").notNull().default(1),
    timezone: text("timezone").notNull().default("Africa/Lagos"),
    industry: text("industry"),
    coaTemplate: text("coa_template"),
    goLiveDate: date("go_live_date"),
    status: entityStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    // Target for composite (entity_id, org_id) foreign keys, so a row can never
    // claim an entity from a different org.
    unique("entities_id_org_key").on(t.id, t.orgId),
    check("entities_fiscal_year_start_month_check", sql`${t.fiscalYearStartMonth} between 1 and 12`),
  ],
).enableRLS();

export const entityAccess = pgTable(
  "entity_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    entityId: uuid("entity_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: entityRole("role").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    grantedBy: uuid("granted_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    unique("entity_access_entity_user_key").on(t.entityId, t.userId),
    foreignKey({ name: "entity_access_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }).onDelete("cascade"),
  ],
).enableRLS();

export const userEntityPrefs = pgTable(
  "user_entity_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    entityId: uuid("entity_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayMode: displayMode("display_mode").notNull(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("user_entity_prefs_user_entity_key").on(t.userId, t.entityId),
    foreignKey({ name: "user_entity_prefs_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }).onDelete("cascade"),
  ],
).enableRLS();

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id"),
    email: text("email").notNull(),
    role: invitationRole("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    unique("invitations_token_hash_key").on(t.tokenHash),
    foreignKey({ name: "invitations_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }).onDelete("cascade"),
    check("invitations_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
).enableRLS();
