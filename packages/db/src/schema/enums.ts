import { BILLING_STATUSES, DISPLAY_MODES, ENTITY_ROLES, INVITABLE_ROLES, ORG_KINDS, ORG_ROLES } from "@kedge/core";
import { pgEnum } from "drizzle-orm/pg-core";

export const orgKind = pgEnum("org_kind", ORG_KINDS);
export const billingStatus = pgEnum("billing_status", BILLING_STATUSES);
export const orgRole = pgEnum("org_role", ORG_ROLES);
export const membershipStatus = pgEnum("membership_status", ["active", "suspended"]);
export const entityStatus = pgEnum("entity_status", ["active", "archived"]);
export const entityRole = pgEnum("entity_role", ENTITY_ROLES);
export const invitationRole = pgEnum("invitation_role", INVITABLE_ROLES);
export const displayMode = pgEnum("display_mode", DISPLAY_MODES);
