import { PermissionDeniedError } from "../errors";
import type { Actor } from "../tenancy/actor";
import { isOrgPermission, PERMISSION_MATRIX, type Permission } from "./matrix";
import { isOrgWideRole, type Role } from "./roles";

/**
 * The role an actor effectively holds on one entity of their org, or null if
 * they have no access to it.
 *
 * - Org Owners and Admins hold their org role on every entity in the org.
 * - Firm staff (Accountant, Bookkeeper) need an active membership **and** an
 *   unexpired grant for the entity; the grant's role applies.
 * - Client users need an unexpired grant only.
 *
 * The caller must ensure `entityId` belongs to `actor.orgId`.
 */
export function effectiveEntityRole(actor: Actor, entityId: string, now: Date = new Date()): Role | null {
  if (isOrgWideRole(actor.orgRole)) return actor.orgRole;

  const grant = actor.entityGrants.get(entityId);
  if (!grant) return null;
  if (grant.expiresAt !== null && grant.expiresAt.getTime() <= now.getTime()) return null;

  switch (grant.role) {
    case "accountant":
    case "bookkeeper":
      return actor.orgRole === null ? null : grant.role;
    case "client_owner":
    case "client_staff":
    case "viewer":
      return grant.role;
    default: {
      const unreachable: never = grant.role;
      return unreachable;
    }
  }
}

/**
 * Whether `actor` holds `permission`. Org-level permissions ignore `entityId`;
 * entity-level permissions require one.
 */
export function can(actor: Actor, permission: Permission, entityId: string | null, now: Date = new Date()): boolean {
  const allowed = PERMISSION_MATRIX[permission];

  if (isOrgPermission(permission)) {
    return actor.orgRole !== null && allowed.includes(actor.orgRole);
  }

  if (entityId === null) return false;
  const role = effectiveEntityRole(actor, entityId, now);
  return role !== null && allowed.includes(role);
}

/** Throws `PermissionDeniedError` unless `actor` holds `permission`. */
export function assertCan(actor: Actor, permission: Permission, entityId: string | null, now: Date = new Date()): void {
  if (!can(actor, permission, entityId, now)) throw new PermissionDeniedError(permission);
}

/** Whether the actor can see anything at all in the entity. */
export function canAccessEntity(actor: Actor, entityId: string, now: Date = new Date()): boolean {
  return effectiveEntityRole(actor, entityId, now) !== null;
}
