import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Actor, EntityGrant } from "../tenancy/actor";
import { assertCan, can, effectiveEntityRole } from "./can";
import { PERMISSIONS, type Permission } from "./matrix";
import { ROLES, type EntityRole, type OrgRole, type Role } from "./roles";

const ORG = "org-1";
const ENTITY = "entity-1";
const OTHER_ENTITY = "entity-2";
const NOW = new Date("2026-10-22T12:00:00Z");

function actor(orgRole: OrgRole | null, grants: Record<string, EntityGrant> = {}): Actor {
  return { userId: "u1", email: "u1@example.com", orgId: ORG, orgRole, entityGrants: new Map(Object.entries(grants)) };
}

/** Builds the actor that holds `role` on ENTITY, the way the app grants it. */
function actorWithRole(role: Role): Actor {
  switch (role) {
    case "org_owner":
    case "org_admin":
      return actor(role);
    case "accountant":
    case "bookkeeper":
      return actor(role, { [ENTITY]: { role, expiresAt: null } });
    case "client_owner":
    case "client_staff":
    case "viewer":
      return actor(null, { [ENTITY]: { role, expiresAt: null } });
  }
}

/**
 * SPEC §3.3 transcribed independently of PERMISSION_MATRIX.
 * Columns: Owner, Admin, Accountant, Bookkeeper, Client Owner, Client Staff, Viewer.
 */
const SPEC_TABLE: Record<Permission, string> = {
  "billing.manage": "✓ — — — — — —",
  "org.users.manage": "✓ ✓ — — — — —",
  "entity.create": "✓ ✓ — — — — —",
  "entity.settings.edit": "✓ ✓ A — ✓ — —",
  "entity.users.invite": "✓ ✓ A — ✓ — —",
  "coa.edit": "✓ ✓ A — — — —",
  "transaction.create": "✓ ✓ A A ✓ ✓ —",
  "transaction.post": "✓ ✓ A A ✓ — —",
  "journal.manual.post": "✓ ✓ A — — — —",
  "journal.reverse": "✓ ✓ A — — — —",
  "statement.import": "✓ ✓ A A ✓ — —",
  "reconciliation.complete": "✓ ✓ A A — — —",
  "period.lock": "✓ ✓ A — — — —",
  "period.unlock": "✓ ✓ A — — — —",
  "year.close": "✓ ✓ — — — — —",
  "year.reopen": "✓ ✓ — — — — —",
  "budget.edit": "✓ ✓ A — ✓ — —",
  "fs_upload.import_history.post": "✓ ✓ A — — — —",
  "fs_upload.analysis": "✓ ✓ A A ✓ — —",
  "report.view": "✓ ✓ A A ✓ — ✓",
  "audit_log.view": "✓ ✓ A — ✓ — —",
  "data.export": "✓ ✓ A — ✓ — —",
};

describe("can() implements the SPEC §3.3 matrix", () => {
  for (const permission of PERMISSIONS) {
    const cells = SPEC_TABLE[permission].split(" ");
    ROLES.forEach((role, i) => {
      const expected = cells[i] !== "—";
      it(`${role} ${expected ? "can" : "cannot"} ${permission}`, () => {
        expect(can(actorWithRole(role), permission, ENTITY, NOW)).toBe(expected);
      });
    });
  }
});

describe("assigned-entity rules", () => {
  it("firm staff have no access to entities they are not assigned to", () => {
    for (const role of ["accountant", "bookkeeper"] as const) {
      const a = actorWithRole(role);
      expect(effectiveEntityRole(a, OTHER_ENTITY, NOW)).toBeNull();
      for (const p of PERMISSIONS) expect(can(a, p, OTHER_ENTITY, NOW)).toBe(false);
    }
  });

  it("org owners and admins act on every entity in the org", () => {
    expect(can(actor("org_owner"), "journal.manual.post", OTHER_ENTITY, NOW)).toBe(true);
    expect(can(actor("org_admin"), "period.lock", OTHER_ENTITY, NOW)).toBe(true);
  });

  it("a staff grant is void without an active membership", () => {
    const suspended = actor(null, { [ENTITY]: { role: "accountant", expiresAt: null } });
    expect(effectiveEntityRole(suspended, ENTITY, NOW)).toBeNull();
    expect(can(suspended, "report.view", ENTITY, NOW)).toBe(false);
  });

  it("expired grants give no access", () => {
    const viewer = actor(null, { [ENTITY]: { role: "viewer", expiresAt: new Date("2026-10-22T11:59:59Z") } });
    expect(can(viewer, "report.view", ENTITY, NOW)).toBe(false);
    const current = actor(null, { [ENTITY]: { role: "viewer", expiresAt: new Date("2026-10-23T00:00:00Z") } });
    expect(can(current, "report.view", ENTITY, NOW)).toBe(true);
  });

  it("entity permissions require an entity", () => {
    expect(can(actor("org_owner"), "report.view", null, NOW)).toBe(false);
  });

  it("client users never hold org permissions", () => {
    const owner = actorWithRole("client_owner");
    expect(can(owner, "entity.create", null, NOW)).toBe(false);
    expect(can(owner, "org.users.manage", ENTITY, NOW)).toBe(false);
  });

  it("assertCan throws a typed error", () => {
    expect(() => assertCan(actorWithRole("viewer"), "transaction.create", ENTITY, NOW)).toThrowError(
      expect.objectContaining({ code: "permission_denied", permission: "transaction.create" }),
    );
  });
});

describe("property: no access without a grant or org-wide role", () => {
  const entityRole = fc.constantFrom<EntityRole>("accountant", "bookkeeper", "client_owner", "client_staff", "viewer");
  const staffOrNull = fc.constantFrom<OrgRole | null>("accountant", "bookkeeper", null);

  it("holds for any grant set that excludes the target entity", () => {
    fc.assert(
      fc.property(
        staffOrNull,
        fc.dictionary(fc.uuid().filter((id) => id !== ENTITY), fc.record({ role: entityRole, expiresAt: fc.constant(null) })),
        fc.constantFrom(...PERMISSIONS),
        (orgRole, grants, permission) => {
          // Org-level permissions depend on the org role only, and staff roles hold none.
          return !can(actor(orgRole, grants), permission, ENTITY, NOW);
        },
      ),
    );
  });
});
