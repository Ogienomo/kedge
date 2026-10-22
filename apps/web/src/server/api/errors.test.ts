import { ConflictError, InvitationExpiredError, NotFoundError, PermissionDeniedError, UnauthenticatedError, ValidationError } from "@kedge/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorResponse, MfaRequiredError } from "./errors";

describe("errorResponse", () => {
  it.each([
    [new ValidationError("bad"), 422, "validation_failed"],
    [new PermissionDeniedError("coa.edit"), 403, "permission_denied"],
    [new NotFoundError("Thing"), 404, "not_found"],
    [new ConflictError("dup"), 409, "conflict"],
    [new UnauthenticatedError(), 401, "unauthenticated"],
    [new MfaRequiredError(), 401, "mfa_required"],
    [new InvitationExpiredError(), 410, "invitation_expired"],
  ])("maps %s", (error, status, code) => {
    const res = errorResponse(error);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it("turns Zod errors into field issues", () => {
    const parsed = z.object({ email: z.email() }).safeParse({ email: "nope" });
    const res = errorResponse(parsed.error);
    expect(res.status).toBe(422);
    expect(res.body.error.issues?.[0]?.path).toBe("email");
  });

  it("maps database permission backstops to 403", () => {
    const pgError = Object.assign(new Error("new row violates row-level security policy"), { code: "42501" });
    const wrapped = new Error("Failed query", { cause: pgError });
    expect(errorResponse(wrapped)).toMatchObject({ status: 403, body: { error: { code: "permission_denied" } } });
  });

  it("never leaks internal error messages", () => {
    const res = errorResponse(new Error("connection string postgres://secret"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});
