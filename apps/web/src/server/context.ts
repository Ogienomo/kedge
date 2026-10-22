import { UnauthenticatedError } from "@kedge/core";
import type { AuthClaims, Database } from "@kedge/db";
import type { EmailSender } from "./email";

/** Everything a service needs for one request. Built by the HTTP layer or by tests. */
export interface ServiceContext {
  readonly db: Database;
  /** Verified identity, or null for anonymous requests. */
  readonly claims: AuthClaims | null;
  readonly now: Date;
  readonly meta: { readonly ip: string | null; readonly userAgent: string | null };
  readonly email: EmailSender;
  readonly appUrl: string;
  /** Asks the auth provider (not the client) whether the caller has a verified second factor. */
  readonly mfa: { readonly hasVerifiedFactor: () => Promise<boolean> };
}

export function requireClaims(ctx: ServiceContext): AuthClaims {
  if (!ctx.claims) throw new UnauthenticatedError();
  return ctx.claims;
}
