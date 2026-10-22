import { INVITATION_TTL_DAYS } from "@kedge/config";
import {
  InvitationEmailMismatchError,
  InvitationExpiredError,
  InvitationUnavailableError,
  PermissionDeniedError,
  ValidationError,
} from "../errors";
import { can, effectiveEntityRole } from "../permissions/can";
import type { Role } from "../permissions/roles";
import type { Actor } from "../tenancy/actor";

/** Roles that can be invited. Org Owner is never invited: ownership is transferred. */
export const INVITABLE_ROLES = ["org_admin", "accountant", "bookkeeper", "client_owner", "client_staff", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** Org-scope invitations create a membership only. */
const ORG_SCOPE_ROLES: readonly InvitableRole[] = ["org_admin", "accountant", "bookkeeper"];

/**
 * Entity-scope invitations. Accountant and Bookkeeper create a membership
 * plus an entity grant (the assignment); client roles create a grant only.
 */
const ENTITY_SCOPE_ROLES: readonly InvitableRole[] = ["accountant", "bookkeeper", "client_owner", "client_staff", "viewer"];

/**
 * Which roles the actor may invite into the given scope (ADR 0002):
 * - Org Owner / Admin: any invitable role, in any scope it fits.
 * - Accountant (assigned): client roles on that entity.
 * - Client Owner: Client Staff and Viewer on their entity (SPEC §3.3).
 */
export function invitableRoles(actor: Actor, entityId: string | null, now: Date = new Date()): readonly InvitableRole[] {
  if (entityId === null) {
    return can(actor, "org.users.manage", null, now) ? ORG_SCOPE_ROLES : [];
  }
  if (!can(actor, "entity.users.invite", entityId, now)) return [];
  if (can(actor, "org.users.manage", null, now)) return ENTITY_SCOPE_ROLES;

  const role = effectiveEntityRole(actor, entityId, now);
  switch (role) {
    case "accountant":
      return ["client_owner", "client_staff", "viewer"];
    case "client_owner":
      return ["client_staff", "viewer"];
    default:
      return [];
  }
}

export function assertCanInvite(actor: Actor, role: InvitableRole, entityId: string | null, now: Date = new Date()): void {
  assertInvitationScope(role, entityId);
  if (!invitableRoles(actor, entityId, now).includes(role)) {
    throw new PermissionDeniedError(entityId === null ? "org.users.manage" : "entity.users.invite", `You cannot invite a ${role} here`);
  }
}

/** Org Admin is org-wide only; client roles need an entity. */
export function assertInvitationScope(role: InvitableRole, entityId: string | null): void {
  const allowed = entityId === null ? ORG_SCOPE_ROLES : ENTITY_SCOPE_ROLES;
  if (!allowed.includes(role)) {
    throw new ValidationError(
      entityId === null ? `A ${role} invitation must be for a specific business` : `A ${role} invitation cannot be limited to one business`,
      [{ path: "entityId", message: "Invalid scope for role" }],
    );
  }
}

export function invitationExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface InvitationState {
  readonly email: string;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
}

export function invitationStatus(inv: InvitationState, now: Date = new Date()): InvitationStatus {
  if (inv.acceptedAt !== null) return "accepted";
  if (inv.revokedAt !== null) return "revoked";
  if (inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}

/** Throws unless the invitation can be accepted by a user with `userEmail`. */
export function assertCanAccept(inv: InvitationState, userEmail: string, now: Date = new Date()): void {
  const status = invitationStatus(inv, now);
  switch (status) {
    case "pending":
      break;
    case "accepted":
    case "revoked":
      throw new InvitationUnavailableError(status);
    case "expired":
      throw new InvitationExpiredError();
    default: {
      const unreachable: never = status;
      throw unreachable;
    }
  }
  if (normaliseEmail(inv.email) !== normaliseEmail(userEmail)) throw new InvitationEmailMismatchError();
}

/** What accepting an invitation grants. */
export interface AcceptanceGrants {
  readonly membershipRole: "org_admin" | "accountant" | "bookkeeper" | null;
  readonly entityGrantRole: "accountant" | "bookkeeper" | "client_owner" | "client_staff" | "viewer" | null;
}

export function grantsForInvitation(role: InvitableRole, entityId: string | null): AcceptanceGrants {
  assertInvitationScope(role, entityId);
  switch (role) {
    case "org_admin":
      return { membershipRole: "org_admin", entityGrantRole: null };
    case "accountant":
    case "bookkeeper":
      return { membershipRole: role, entityGrantRole: entityId === null ? null : role };
    case "client_owner":
    case "client_staff":
    case "viewer":
      return { membershipRole: null, entityGrantRole: role };
    default: {
      const unreachable: never = role;
      return unreachable;
    }
  }
}

const TOKEN_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A random URL-safe invitation token. Only its hash is stored. */
export function generateInvitationToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashInvitationToken(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "org_owner":
      return "Owner";
    case "org_admin":
      return "Admin";
    case "accountant":
      return "Accountant";
    case "bookkeeper":
      return "Bookkeeper";
    case "client_owner":
      return "Business owner";
    case "client_staff":
      return "Staff";
    case "viewer":
      return "Viewer";
    default: {
      const unreachable: never = role;
      return unreachable;
    }
  }
}
