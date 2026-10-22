import type { Role } from "./roles";

/**
 * The SPEC §3.3 permission matrix. This table is the single source of truth
 * for role permissions; never write ad-hoc role checks elsewhere.
 *
 * "A" (assigned entities only) needs no special marker here: firm staff only
 * hold an effective role on an entity when they have an entity access grant
 * for it (see `effectiveEntityRole`).
 */
export const PERMISSIONS = [
  "billing.manage",
  "org.users.manage",
  "entity.create",
  "entity.settings.edit",
  "entity.users.invite",
  "coa.edit",
  "transaction.create",
  "transaction.post",
  "journal.manual.post",
  "journal.reverse",
  "statement.import",
  "reconciliation.complete",
  "period.lock",
  "period.unlock",
  "year.close",
  "year.reopen",
  "budget.edit",
  "fs_upload.import_history.post",
  "fs_upload.analysis",
  "report.view",
  "audit_log.view",
  "data.export",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permissions that apply to the org as a whole rather than to one entity. */
export const ORG_PERMISSIONS = ["billing.manage", "org.users.manage", "entity.create"] as const satisfies readonly Permission[];
export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

export function isOrgPermission(permission: Permission): permission is OrgPermission {
  return (ORG_PERMISSIONS as readonly Permission[]).includes(permission);
}

const O = "org_owner";
const AD = "org_admin";
const AC = "accountant";
const BK = "bookkeeper";
const CO = "client_owner";
const CS = "client_staff";
const VW = "viewer";

export const PERMISSION_MATRIX: Readonly<Record<Permission, readonly Role[]>> = {
  "billing.manage": [O],
  "org.users.manage": [O, AD],
  "entity.create": [O, AD],
  "entity.settings.edit": [O, AD, AC, CO],
  "entity.users.invite": [O, AD, AC, CO],
  "coa.edit": [O, AD, AC],
  "transaction.create": [O, AD, AC, BK, CO, CS],
  "transaction.post": [O, AD, AC, BK, CO],
  "journal.manual.post": [O, AD, AC],
  "journal.reverse": [O, AD, AC],
  "statement.import": [O, AD, AC, BK, CO],
  "reconciliation.complete": [O, AD, AC, BK],
  "period.lock": [O, AD, AC],
  "period.unlock": [O, AD, AC],
  "year.close": [O, AD],
  "year.reopen": [O, AD],
  "budget.edit": [O, AD, AC, CO],
  "fs_upload.import_history.post": [O, AD, AC],
  "fs_upload.analysis": [O, AD, AC, BK, CO],
  "report.view": [O, AD, AC, BK, CO, VW],
  "audit_log.view": [O, AD, AC, CO],
  "data.export": [O, AD, AC, CO],
};
