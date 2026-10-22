import type { ApiError } from "@kedge/api";
import { DomainError, ValidationError } from "@kedge/core";
import { z } from "zod";

/** Stable error code → HTTP status. Every DomainError code must be listed. */
const STATUS_BY_CODE: Record<string, number> = {
  validation_failed: 422,
  permission_denied: 403,
  not_found: 404,
  conflict: 409,
  unauthenticated: 401,
  mfa_required: 401,
  invitation_expired: 410,
  invitation_unavailable: 410,
  invitation_email_mismatch: 403,
};

export function errorResponse(e: unknown): { status: number; body: ApiError } {
  if (e instanceof z.ZodError) {
    return errorResponse(new ValidationError("The request is invalid", e.issues.map((i) => ({ path: i.path.join("."), message: i.message }))));
  }
  if (e instanceof DomainError) {
    const issues = e instanceof ValidationError && e.issues.length > 0 ? { issues: [...e.issues] } : {};
    return { status: STATUS_BY_CODE[e.code] ?? 400, body: { error: { code: e.code, message: e.message, ...issues } } };
  }
  // The database refused on security grounds (RLS policy, guard trigger): a
  // backstop fired that the domain checks should have caught first.
  if (sqlState(e) === "42501") {
    console.error("[api] database permission backstop triggered");
    return { status: 403, body: { error: { code: "permission_denied", message: "You do not have permission to do that" } } };
  }
  // Unknown errors: log the type only (never payloads), answer generically.
  console.error("[api] unhandled error", e instanceof Error ? e.name : typeof e);
  return { status: 500, body: { error: { code: "internal_error", message: "Something went wrong. Please try again." } } };
}

export class MfaRequiredError extends DomainError {
  readonly code = "mfa_required";

  constructor() {
    super("Verify your second factor to continue");
  }
}

/** SQLSTATE of a (possibly wrapped) Postgres error. */
function sqlState(e: unknown): string | null {
  let current: unknown = e;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause;
  }
  return null;
}
