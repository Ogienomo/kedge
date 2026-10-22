/** AC-0.2: sign-up creates an org of the chosen kind, and the creator is Org Owner. */
import type { MeResponse, OrganisationContext } from "@kedge/api";
import { createAuthUser, seedTenant } from "@kedge/db/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endpoints } from "../api/endpoints";
import { body, createHarness, type Harness } from "./helpers";

let h: Harness;

beforeAll(() => {
  h = createHarness();
});

afterAll(async () => {
  await h.handle.close();
});

describe("sign-up creates an organisation", () => {
  it.each(["business", "firm"] as const)("of kind %s, with the creator as Org Owner", async (kind) => {
    const user = await createAuthUser(h.handle.db, `signup-${kind}`);
    const now = new Date("2026-10-22T09:00:00Z");
    const res = await h.call(endpoints.createOrganisation, { claims: user.claims, body: { name: `  ${kind} Co  `, kind }, now });
    expect(res.status).toBe(201);

    const ctx = body<OrganisationContext>(res);
    expect(ctx.organisation).toMatchObject({ name: `${kind} Co`, kind, billingStatus: "trialing" });
    expect(ctx.organisation.trialEndsAt).toBe("2026-11-05T09:00:00.000Z");
    expect(ctx.role).toBe("org_owner");
    expect(ctx.orgPermissions).toEqual(["billing.manage", "org.users.manage", "entity.create"]);

    const me = body<MeResponse>(await h.call(endpoints.getMe, { claims: user.claims }));
    expect(me.organisations).toEqual([{ id: ctx.organisation.id, name: `${kind} Co`, kind, role: "org_owner" }]);

    const audit = await h.handle.db.execute<{ action: string; actor: string }>(
      sql`select action, actor_user_id::text as actor from audit_log where org_id = ${ctx.organisation.id} order by at, action`,
    );
    expect(audit.map((r) => r.action).sort()).toEqual(["membership.create", "organisation.create"]);
    expect(new Set(audit.map((r) => r.actor))).toEqual(new Set([user.id]));
  });

  it("rejects an unknown kind and a blank name", async () => {
    const user = await createAuthUser(h.handle.db, "signup-bad");
    expect((await h.call(endpoints.createOrganisation, { claims: user.claims, body: { name: "X", kind: "charity" } })).status).toBe(422);
    expect((await h.call(endpoints.createOrganisation, { claims: user.claims, body: { name: " ", kind: "firm" } })).status).toBe(422);
  });

  it("the owner can add a business (entity shell) and sees it with full permissions", async () => {
    const user = await createAuthUser(h.handle.db, "signup-entity");
    const org = body<OrganisationContext>(await h.call(endpoints.createOrganisation, { claims: user.claims, body: { name: "Ada Firm", kind: "firm" } }));
    const res = await h.call(endpoints.createEntity, { claims: user.claims, params: { orgId: org.organisation.id }, body: { legalName: "Adaeze Catering Ltd" } });
    expect(res.status).toBe(201);
    const ctx = body<OrganisationContext>(await h.call(endpoints.getOrganisation, { claims: user.claims, params: { orgId: org.organisation.id } }));
    expect(ctx.entities).toHaveLength(1);
    expect(ctx.entities[0]).toMatchObject({ legalName: "Adaeze Catering Ltd", role: "org_owner", displayMode: "accountant" });
  });
});

describe("MFA enforcement", () => {
  it("users with a verified factor must present an aal2 session", async () => {
    const user = await createAuthUser(h.handle.db, "mfa");
    await h.call(endpoints.syncMfa, { claims: user.claims, hasVerifiedFactor: true });
    const aal1 = await h.call(endpoints.getMe, { claims: { ...user.claims, aal: "aal1" } });
    expect(aal1.status).toBe(401);
    expect(aal1.body).toMatchObject({ error: { code: "mfa_required" } });
    const aal2 = await h.call(endpoints.getMe, { claims: { ...user.claims, aal: "aal2" } });
    expect(aal2.status).toBe(200);
    expect(body<MeResponse>(aal2).user.mfaEnabled).toBe(true);
  });
});

describe("organisation details (firm wizard, org settings)", () => {
  it("an owner renames the org and sets a brand colour, audited with before and after", async () => {
    const t = await seedTenant(h.handle.db, "org-update");
    const res = await h.call(endpoints.updateOrganisation, { claims: t.owner.claims, params: { orgId: t.orgId }, body: { name: " Bello & Co ", brandColour: "#1f6feb" } });
    expect(res.status).toBe(200);
    expect(body<OrganisationContext>(res).organisation).toMatchObject({ name: "Bello & Co", brandColour: "#1F6FEB" });

    const [audit] = await h.handle.db.execute<{ before: { brandColour: string | null }; after: { name: string; brandColour: string } }>(
      sql`select before, after from audit_log where org_id = ${t.orgId} and action = 'organisation.update'`,
    );
    expect(audit?.before.brandColour).toBeNull();
    expect(audit?.after).toEqual({ name: "Bello & Co", brandColour: "#1F6FEB" });

    const cleared = await h.call(endpoints.updateOrganisation, { claims: t.owner.claims, params: { orgId: t.orgId }, body: { brandColour: null } });
    expect(body<OrganisationContext>(cleared).organisation).toMatchObject({ name: "Bello & Co", brandColour: null });
  });

  it("rejects a malformed colour and an empty change", async () => {
    const t = await seedTenant(h.handle.db, "org-update-bad");
    for (const b of [{ brandColour: "blue" }, { brandColour: "#12345" }, {}]) {
      expect((await h.call(endpoints.updateOrganisation, { claims: t.owner.claims, params: { orgId: t.orgId }, body: b })).status).toBe(422);
    }
  });

  it("staff without org.users.manage cannot change the org", async () => {
    const t = await seedTenant(h.handle.db, "org-update-staff");
    const res = await h.call(endpoints.updateOrganisation, { claims: t.accountant.claims, params: { orgId: t.orgId }, body: { name: "Mine now" } });
    expect(res.status).toBe(403);
  });
});
