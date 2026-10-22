import { describe, expect, it } from "vitest";
import type { Actor, EntityGrant } from "../tenancy/actor";
import type { OrgRole } from "../permissions/roles";
import {
  assertCanAccept,
  assertCanInvite,
  generateInvitationToken,
  grantsForInvitation,
  hashInvitationToken,
  invitableRoles,
  invitationExpiresAt,
  invitationStatus,
} from "./invitations";

const NOW = new Date("2026-10-22T12:00:00Z");
const E = "entity-1";

function actor(orgRole: OrgRole | null, grants: Record<string, EntityGrant> = {}): Actor {
  return { userId: "u1", email: "a@example.com", orgId: "o1", orgRole, entityGrants: new Map(Object.entries(grants)) };
}

describe("invitableRoles", () => {
  it("owners and admins can invite org staff and admins at org scope", () => {
    expect(invitableRoles(actor("org_owner"), null, NOW)).toEqual(["org_admin", "accountant", "bookkeeper"]);
    expect(invitableRoles(actor("org_admin"), null, NOW)).toEqual(["org_admin", "accountant", "bookkeeper"]);
  });

  it("owners can invite every entity role", () => {
    expect(invitableRoles(actor("org_owner"), E, NOW)).toEqual(["accountant", "bookkeeper", "client_owner", "client_staff", "viewer"]);
  });

  it("assigned accountants invite client roles only", () => {
    const a = actor("accountant", { [E]: { role: "accountant", expiresAt: null } });
    expect(invitableRoles(a, E, NOW)).toEqual(["client_owner", "client_staff", "viewer"]);
    expect(invitableRoles(a, null, NOW)).toEqual([]);
    expect(invitableRoles(a, "other", NOW)).toEqual([]);
  });

  it("client owners invite staff and viewers (SPEC §3.3)", () => {
    const a = actor(null, { [E]: { role: "client_owner", expiresAt: null } });
    expect(invitableRoles(a, E, NOW)).toEqual(["client_staff", "viewer"]);
    expect(() => assertCanInvite(a, "client_owner", E, NOW)).toThrowError(expect.objectContaining({ code: "permission_denied" }));
  });

  it("bookkeepers, staff and viewers cannot invite", () => {
    for (const role of ["bookkeeper", "client_staff", "viewer"] as const) {
      const a = actor(role === "bookkeeper" ? "bookkeeper" : null, { [E]: { role, expiresAt: null } });
      expect(invitableRoles(a, E, NOW)).toEqual([]);
    }
  });

  it("rejects invalid scopes", () => {
    expect(() => assertCanInvite(actor("org_owner"), "client_owner", null, NOW)).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() => assertCanInvite(actor("org_owner"), "org_admin", E, NOW)).toThrowError(expect.objectContaining({ code: "validation_failed" }));
  });
});

describe("invitation lifecycle", () => {
  const base = { email: "Invitee@Example.com", expiresAt: invitationExpiresAt(NOW), acceptedAt: null, revokedAt: null };

  it("expires exactly 7 days after creation", () => {
    expect(base.expiresAt.toISOString()).toBe("2026-10-29T12:00:00.000Z");
    expect(invitationStatus(base, new Date("2026-10-29T11:59:59Z"))).toBe("pending");
    expect(invitationStatus(base, new Date("2026-10-29T12:00:00Z"))).toBe("expired");
  });

  it("accepts for the invited email, case-insensitively", () => {
    expect(() => assertCanAccept(base, " invitee@example.com", NOW)).not.toThrow();
    expect(() => assertCanAccept(base, "someone@example.com", NOW)).toThrowError(expect.objectContaining({ code: "invitation_email_mismatch" }));
  });

  it("rejects expired, accepted and revoked invitations", () => {
    const later = new Date("2026-11-01T00:00:00Z");
    expect(() => assertCanAccept(base, base.email, later)).toThrowError(expect.objectContaining({ code: "invitation_expired" }));
    expect(() => assertCanAccept({ ...base, acceptedAt: NOW }, base.email, NOW)).toThrowError(expect.objectContaining({ code: "invitation_unavailable" }));
    expect(() => assertCanAccept({ ...base, revokedAt: NOW }, base.email, NOW)).toThrowError(expect.objectContaining({ code: "invitation_unavailable" }));
  });

  it("maps every role to the right grants", () => {
    expect(grantsForInvitation("org_admin", null)).toEqual({ membershipRole: "org_admin", entityGrantRole: null });
    expect(grantsForInvitation("accountant", null)).toEqual({ membershipRole: "accountant", entityGrantRole: null });
    expect(grantsForInvitation("bookkeeper", E)).toEqual({ membershipRole: "bookkeeper", entityGrantRole: "bookkeeper" });
    expect(grantsForInvitation("client_owner", E)).toEqual({ membershipRole: null, entityGrantRole: "client_owner" });
    expect(grantsForInvitation("client_staff", E)).toEqual({ membershipRole: null, entityGrantRole: "client_staff" });
    expect(grantsForInvitation("viewer", E)).toEqual({ membershipRole: null, entityGrantRole: "viewer" });
  });

  it("tokens are random and hash deterministically", async () => {
    const t1 = generateInvitationToken();
    const t2 = generateInvitationToken();
    expect(t1).not.toBe(t2);
    expect(t1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await hashInvitationToken(t1)).toBe(await hashInvitationToken(t1));
    expect(await hashInvitationToken(t1)).toMatch(/^[0-9a-f]{64}$/);
  });
});
