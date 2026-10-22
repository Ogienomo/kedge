import type { EntityRole, OrgRole } from "../permissions/roles";

export interface EntityGrant {
  readonly role: EntityRole;
  /** Time-bound access (e.g. Viewers for auditors). Null means no expiry. */
  readonly expiresAt: Date | null;
}

/**
 * The authenticated user acting within one organisation, with every grant
 * they hold in it. Loaded once per request by the API layer.
 */
export interface Actor {
  readonly userId: string;
  readonly email: string;
  readonly orgId: string;
  /** Role from an active membership, or null for client users and suspended members. */
  readonly orgRole: OrgRole | null;
  /** Entity access grants keyed by entity ID. */
  readonly entityGrants: ReadonlyMap<string, EntityGrant>;
}

/** Explicit tenant scope passed to every domain operation. */
export interface TenantContext {
  readonly orgId: string;
  readonly entityId: string | null;
  readonly actor: Actor;
}
