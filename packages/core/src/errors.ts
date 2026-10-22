/**
 * Typed domain errors. Route handlers map `code` to an HTTP status and return
 * it to clients as a stable error code. Never throw strings.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = "validation_failed";

  constructor(
    message: string,
    readonly issues: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

export class PermissionDeniedError extends DomainError {
  readonly code = "permission_denied";

  constructor(
    readonly permission: string,
    message = `Missing permission: ${permission}`,
  ) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(readonly resource: string) {
    super(`${resource} not found`);
  }
}

export class ConflictError extends DomainError {
  readonly code = "conflict";
}

export class UnauthenticatedError extends DomainError {
  readonly code = "unauthenticated";

  constructor(message = "Authentication required") {
    super(message);
  }
}

export class InvitationExpiredError extends DomainError {
  readonly code = "invitation_expired";

  constructor() {
    super("This invitation has expired");
  }
}

export class InvitationUnavailableError extends DomainError {
  readonly code = "invitation_unavailable";

  constructor(reason: "accepted" | "revoked") {
    super(reason === "accepted" ? "This invitation has already been accepted" : "This invitation has been revoked");
  }
}

export class InvitationEmailMismatchError extends DomainError {
  readonly code = "invitation_email_mismatch";

  constructor() {
    super("This invitation was sent to a different email address");
  }
}
