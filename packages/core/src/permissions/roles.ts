/** Org-level roles held through a membership (SPEC §3.2). */
export const ORG_ROLES = ["org_owner", "org_admin", "accountant", "bookkeeper"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Entity-level roles held through an entity access grant (SPEC §3.2, §5.1). */
export const ENTITY_ROLES = ["accountant", "bookkeeper", "client_owner", "client_staff", "viewer"] as const;
export type EntityRole = (typeof ENTITY_ROLES)[number];

/** Every role in the permission matrix. */
export const ROLES = ["org_owner", "org_admin", "accountant", "bookkeeper", "client_owner", "client_staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that have access to every entity in their org. */
export const ORG_WIDE_ROLES = ["org_owner", "org_admin"] as const satisfies readonly OrgRole[];
export type OrgWideRole = (typeof ORG_WIDE_ROLES)[number];

/** Firm staff roles: an org membership plus an entity grant per assigned entity. */
export const STAFF_ROLES = ["accountant", "bookkeeper"] as const satisfies readonly OrgRole[];

/** Client roles: an entity grant only, no org membership. */
export const CLIENT_ROLES = ["client_owner", "client_staff", "viewer"] as const satisfies readonly EntityRole[];
export type ClientRole = (typeof CLIENT_ROLES)[number];

export function isOrgWideRole(role: Role | null | undefined): role is OrgWideRole {
  return role === "org_owner" || role === "org_admin";
}

export function isClientRole(role: Role): role is ClientRole {
  return (CLIENT_ROLES as readonly Role[]).includes(role);
}

export function isOrgRole(role: Role): role is OrgRole {
  return (ORG_ROLES as readonly Role[]).includes(role);
}

export function isEntityRole(role: Role): role is EntityRole {
  return (ENTITY_ROLES as readonly Role[]).includes(role);
}
