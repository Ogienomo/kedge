/** AC-0.3: invitations work for every role in SPEC §3.2, expire after 7 days, and are audited. */
import type { AcceptInvitationResponse, Invitation, InvitationPreview, OrganisationContext } from "@kedge/api";
import { INVITABLE_ROLES, type InvitableRole } from "@kedge/core";
import { createAuthUser, seedTenant, type SeededTenant, type TestUser } from "@kedge/db/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endpoints } from "../api/endpoints";
import { body, createHarness, tokenFromOutbox, type Harness } from "./helpers";

let h: Harness;
let t: SeededTenant;

beforeAll(async () => {
  h = createHarness();
  t = await seedTenant(h.handle.db, "inv");
});

afterAll(async () => {
  await h.handle.close();
});

const DAY = 24 * 60 * 60 * 1000;

/** Org-scope for org_admin; entity-scope for everything else (staff invited straight onto a client). */
function scopeFor(role: InvitableRole): string | null {
  return role === "org_admin" ? null : t.entityId;
}

async function invite(inviter: TestUser, email: string, role: InvitableRole, entityId: string | null, now = new Date()) {
  return h.call(endpoints.createInvitation, { claims: inviter.claims, params: { orgId: t.orgId }, body: { email, role, entityId }, now });
}

async function auditActions(targetId: string): Promise<string[]> {
  const rows = await h.handle.db.execute<{ action: string }>(sql`select action from audit_log where target_id = ${targetId} order by at`);
  return rows.map((r) => r.action);
}

describe.each(INVITABLE_ROLES)("inviting a %s", (role) => {
  it("creates, emails, previews and accepts the invitation, granting exactly that role", async () => {
    const invitee = await createAuthUser(h.handle.db, `invitee-${role}`);
    const entityId = scopeFor(role);

    const created = await invite(t.owner, invitee.email.toUpperCase(), role, entityId);
    expect(created.status).toBe(201);
    const inv = body<Invitation>(created);
    expect(inv).toMatchObject({ email: invitee.email, role, entityId, status: "pending" });

    const token = tokenFromOutbox(h.outbox, invitee.email);
    const preview = body<InvitationPreview>(await h.call(endpoints.previewInvitation, { claims: null, body: { token } }));
    expect(preview).toMatchObject({ organisationName: "inv Org", role, email: invitee.email, status: "pending" });

    const accepted = await h.call(endpoints.acceptInvitation, { claims: invitee.claims, body: { token } });
    expect(accepted.status).toBe(200);
    expect(body<AcceptInvitationResponse>(accepted)).toEqual({ orgId: t.orgId, entityId });

    const ctx = body<OrganisationContext>(await h.call(endpoints.getOrganisation, { claims: invitee.claims, params: { orgId: t.orgId } }));
    const expectedOrgRole = role === "org_admin" || role === "accountant" || role === "bookkeeper" ? role : null;
    expect(ctx.role).toBe(expectedOrgRole);
    const entity = ctx.entities.find((e) => e.id === t.entityId);
    expect(entity?.role).toBe(role);
    expect(entity?.displayMode).toBe(["client_owner", "client_staff", "viewer"].includes(role) ? "simple" : "accountant");

    expect(await auditActions(inv.id)).toEqual(["invitation.create", "invitation.accept"]);

    // The token is single-use.
    const again = await h.call(endpoints.acceptInvitation, { claims: invitee.claims, body: { token } });
    expect(again.status).toBe(410);
  });
});

describe("invitation expiry", () => {
  it("expires exactly 7 days after it was sent", async () => {
    const invitee = await createAuthUser(h.handle.db, "expiring");
    const sentAt = new Date();
    const inv = body<Invitation>(await invite(t.owner, invitee.email, "viewer", t.entityId, sentAt));
    expect(new Date(inv.expiresAt).getTime() - new Date(inv.createdAt).getTime()).toBe(7 * DAY);

    const token = tokenFromOutbox(h.outbox, invitee.email);
    const late = await h.call(endpoints.acceptInvitation, { claims: invitee.claims, body: { token }, now: new Date(sentAt.getTime() + 7 * DAY) });
    expect(late.status).toBe(410);
    expect(late.body).toMatchObject({ error: { code: "invitation_expired" } });

    const preview = body<InvitationPreview>(await h.call(endpoints.previewInvitation, { claims: null, body: { token }, now: new Date(sentAt.getTime() + 8 * DAY) }));
    expect(preview.status).toBe("expired");
  });

  it("is also refused by the database once expired, even if the clock in the app is wrong", async () => {
    const invitee = await createAuthUser(h.handle.db, "db-expired");
    const inv = body<Invitation>(await invite(t.owner, invitee.email, "viewer", t.entityId));
    const token = tokenFromOutbox(h.outbox, invitee.email);
    await h.handle.db.execute(sql`update invitations set expires_at = now() - interval '1 second' where id = ${inv.id}`);
    // The app believes it is a day earlier, so only the RLS policy can stop this.
    const res = await h.call(endpoints.acceptInvitation, { claims: invitee.claims, body: { token }, now: new Date(Date.now() - DAY) });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "permission_denied" } });
  });
});

describe("invitation rules", () => {
  it("revoking is audited and stops acceptance", async () => {
    const invitee = await createAuthUser(h.handle.db, "revoked");
    const inv = body<Invitation>(await invite(t.owner, invitee.email, "client_staff", t.entityId));
    const token = tokenFromOutbox(h.outbox, invitee.email);

    const revoked = await h.call(endpoints.revokeInvitation, { claims: t.owner.claims, params: { invitationId: inv.id } });
    expect(body<Invitation>(revoked).status).toBe("revoked");
    expect((await h.call(endpoints.acceptInvitation, { claims: invitee.claims, body: { token } })).status).toBe(410);
    expect(await auditActions(inv.id)).toEqual(["invitation.create", "invitation.revoke"]);
  });

  it("only the invited email can accept", async () => {
    const invitee = await createAuthUser(h.handle.db, "intended");
    const other = await createAuthUser(h.handle.db, "interloper");
    await invite(t.owner, invitee.email, "viewer", t.entityId);
    const token = tokenFromOutbox(h.outbox, invitee.email);
    const res = await h.call(endpoints.acceptInvitation, { claims: other.claims, body: { token } });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "invitation_email_mismatch" } });
  });

  it("client owners can invite staff and viewers, but not other owners (SPEC §3.3)", async () => {
    const clientOwner = await createAuthUser(h.handle.db, "client-owner");
    await invite(t.owner, clientOwner.email, "client_owner", t.entityId);
    await h.call(endpoints.acceptInvitation, { claims: clientOwner.claims, body: { token: tokenFromOutbox(h.outbox, clientOwner.email) } });

    expect((await invite(clientOwner, "staff@example.test", "client_staff", t.entityId)).status).toBe(201);
    expect((await invite(clientOwner, "auditor@example.test", "viewer", t.entityId)).status).toBe(201);
    expect((await invite(clientOwner, "co@example.test", "client_owner", t.entityId)).status).toBe(403);
    expect((await invite(clientOwner, "admin@example.test", "org_admin", null)).status).toBe(403);
  });

  it("viewers cannot invite anyone", async () => {
    expect((await invite(t.viewer, "v@example.test", "viewer", t.entityId)).status).toBe(403);
  });

  it("refuses a second pending invitation for the same person and scope", async () => {
    expect((await invite(t.owner, "dup@example.test", "viewer", t.entityId)).status).toBe(201);
    expect((await invite(t.owner, "dup@example.test", "viewer", t.entityId)).status).toBe(409);
  });

  it("rejects roles that do not fit the scope", async () => {
    expect((await invite(t.owner, "scope1@example.test", "client_owner", null)).status).toBe(422);
    expect((await invite(t.owner, "scope2@example.test", "org_admin", t.entityId)).status).toBe(422);
  });

  it("never stores the token itself", async () => {
    const invitee = await createAuthUser(h.handle.db, "hashcheck");
    await invite(t.owner, invitee.email, "viewer", t.entityId);
    const token = tokenFromOutbox(h.outbox, invitee.email);
    const rows = await h.handle.db.execute<{ n: number }>(
      sql`select count(*)::int as n from invitations where token_hash = ${token} or position(${token} in coalesce(token_hash, '')) > 0`,
    );
    expect(rows[0]?.n).toBe(0);
    const audit = await h.handle.db.execute<{ n: number }>(sql`select count(*)::int as n from audit_log where after::text like ${"%" + token + "%"}`);
    expect(audit[0]?.n).toBe(0);
  });
});
