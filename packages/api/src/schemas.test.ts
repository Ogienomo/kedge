import { describe, expect, it } from "vitest";
import { createInvitationRequestSchema, createOrganisationRequestSchema } from "./schemas";

describe("request schemas", () => {
  it("normalises invitation emails and defaults to org scope", () => {
    expect(createInvitationRequestSchema.parse({ email: "Ada@Example.COM", role: "org_admin" })).toEqual({
      email: "ada@example.com",
      role: "org_admin",
      entityId: null,
    });
  });

  it("rejects the owner role in invitations", () => {
    expect(createInvitationRequestSchema.safeParse({ email: "a@b.co", role: "org_owner" }).success).toBe(false);
  });

  it("requires a non-blank organisation name and a known kind", () => {
    expect(createOrganisationRequestSchema.safeParse({ name: "  ", kind: "firm" }).success).toBe(false);
    expect(createOrganisationRequestSchema.safeParse({ name: "Ada & Co", kind: "charity" }).success).toBe(false);
    expect(createOrganisationRequestSchema.parse({ name: " Ada & Co ", kind: "firm" })).toEqual({ name: "Ada & Co", kind: "firm" });
  });
});
