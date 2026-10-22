/**
 * AC-0.4, API half: a user with no grant on org B cannot read or change
 * anything in org B through /api/v1. Every endpoint that takes an ID is
 * listed below; a new endpoint fails this test until it is covered.
 */
import type { MeResponse } from "@kedge/api";
import { seedTenant, type SeededTenant } from "@kedge/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endpoints } from "../api/endpoints";
import type { Endpoint } from "../api/endpoint";
import { body, createHarness, type Harness } from "./helpers";

let h: Harness;
let a: SeededTenant;
let b: SeededTenant;

beforeAll(async () => {
  h = createHarness();
  a = await seedTenant(h.handle.db, "api-alpha");
  b = await seedTenant(h.handle.db, "api-bravo");
});

afterAll(async () => {
  await h.handle.close();
});

type AnyEndpoint = Endpoint<string, unknown>;

/** For each endpoint that takes IDs: org B's IDs, and a valid body if one is needed. */
const targetsInOrgB: Record<string, () => { params: Record<string, string>; body?: unknown }> = {
  getOrganisation: () => ({ params: { orgId: b.orgId } }),
  listMembers: () => ({ params: { orgId: b.orgId } }),
  createEntity: () => ({ params: { orgId: b.orgId }, body: { legalName: "Hijack Ltd" } }),
  updateEntityPreferences: () => ({ params: { entityId: b.entityId }, body: { displayMode: "simple" } }),
  listInvitations: () => ({ params: { orgId: b.orgId } }),
  createInvitation: () => ({ params: { orgId: b.orgId }, body: { email: "x@example.test", role: "org_admin" } }),
  revokeInvitation: () => ({ params: { invitationId: b.invitationId } }),
};

describe("API tenant isolation", () => {
  it("covers every endpoint that takes an ID", () => {
    const withParams = Object.entries(endpoints)
      .filter(([, def]) => ((def as AnyEndpoint).params ?? []).length > 0)
      .map(([name]) => name)
      .sort();
    expect(Object.keys(targetsInOrgB).sort()).toEqual(withParams);
  });

  for (const name of Object.keys(targetsInOrgB)) {
    it(`${name}: org A's owner gets 404 for org B`, async () => {
      const def = endpoints[name as keyof typeof endpoints] as AnyEndpoint;
      const target = targetsInOrgB[name]?.();
      const res = await h.call(def, { claims: a.owner.claims, params: target?.params ?? {}, body: target?.body });
      expect(res.status).toBe(404);
    });
  }

  it("/me lists only the caller's organisations", async () => {
    const res = await h.call(endpoints.getMe, { claims: a.owner.claims });
    expect(res.status).toBe(200);
    expect(body<MeResponse>(res).organisations.map((o) => o.id)).toEqual([a.orgId]);
  });

  it("an assigned viewer of org A cannot reach org B either", async () => {
    const res = await h.call(endpoints.getOrganisation, { claims: a.viewer.claims, params: { orgId: b.orgId } });
    expect(res.status).toBe(404);
  });

  it("malformed IDs are treated as not found", async () => {
    const res = await h.call(endpoints.getOrganisation, { claims: a.owner.claims, params: { orgId: "../../etc" } });
    expect(res.status).toBe(404);
  });

  it("requests without a verified session are rejected", async () => {
    for (const [name, def] of Object.entries(endpoints)) {
      if ((def as AnyEndpoint).auth === "public") continue;
      const res = await h.call(def as AnyEndpoint, { claims: null, params: { orgId: a.orgId, entityId: a.entityId, invitationId: a.invitationId } });
      expect({ name, status: res.status }).toEqual({ name, status: 401 });
    }
  });
});
