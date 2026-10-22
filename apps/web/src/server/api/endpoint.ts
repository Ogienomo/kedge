import { NotFoundError, UnauthenticatedError, ValidationError } from "@kedge/core";
import { schema, withUser, type AuthClaims } from "@kedge/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ServiceContext } from "../context";
import { errorResponse, MfaRequiredError } from "./errors";

type Params<P extends string> = { readonly [K in P]: string };

/**
 * A framework-agnostic /api/v1 endpoint. Route files adapt it to Next.js;
 * integration tests execute it directly with the same validation, auth and
 * error mapping.
 */
export interface Endpoint<P extends string = never, B = undefined, Q = Record<string, never>> {
  readonly auth: "required" | "public";
  readonly params?: readonly P[];
  readonly body?: z.ZodType<B>;
  readonly query?: z.ZodType<Q>;
  /** Posting endpoints require an Idempotency-Key header (rule 8). */
  readonly idempotency?: "required";
  readonly status?: number;
  /** Only for endpoints that must work mid-login (e.g. syncing MFA state). */
  readonly allowBeforeMfa?: boolean;
  readonly run: (ctx: ServiceContext, input: { params: Params<P>; body: B; query: Q; idempotencyKey: string }) => Promise<unknown>;
}

export function endpoint<P extends string = never, B = undefined, Q = Record<string, never>>(def: Endpoint<P, B, Q>): Endpoint<P, B, Q> {
  return def;
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,200}$/;

export class IdempotencyKeyRequiredError extends ValidationError {
  constructor() {
    super("This request needs an Idempotency-Key header (8–200 letters, digits, '-', '_', '.', ':')", [{ path: "Idempotency-Key", message: "Required" }]);
  }
}

export interface EndpointResult {
  readonly status: number;
  readonly body: unknown;
}

const uuid = z.uuid();

/**
 * Users who have enrolled a second factor must present an aal2 session.
 * The profile mirror is synced server-side from the auth provider.
 */
async function assertMfaSatisfied(ctx: ServiceContext, claims: AuthClaims): Promise<void> {
  if (claims.aal === "aal2") return;
  const [user] = await withUser(ctx.db, claims, (tx) =>
    tx.select({ mfaEnabled: schema.users.mfaEnabled }).from(schema.users).where(eq(schema.users.id, claims.sub)),
  );
  if (user?.mfaEnabled) throw new MfaRequiredError();
}

export async function executeEndpoint<P extends string, B, Q>(
  def: Endpoint<P, B, Q>,
  ctx: ServiceContext,
  raw: { params: Record<string, string | string[] | undefined>; body: unknown; query?: Record<string, string>; idempotencyKey?: string | null },
): Promise<EndpointResult> {
  try {
    if (def.auth === "required") {
      if (!ctx.claims) throw new UnauthenticatedError();
      if (!def.allowBeforeMfa) await assertMfaSatisfied(ctx, ctx.claims);
    }

    const params: Record<string, string> = {};
    for (const name of def.params ?? []) {
      const value = raw.params[name];
      // Every path parameter is an ID; anything else simply does not exist.
      if (typeof value !== "string" || !uuid.safeParse(value).success) throw new NotFoundError("Resource");
      params[name] = value;
    }

    const idempotencyKey = raw.idempotencyKey ?? "";
    if (def.idempotency === "required" && !IDEMPOTENCY_KEY.test(idempotencyKey)) throw new IdempotencyKeyRequiredError();

    const body = def.body ? def.body.parse(raw.body) : (undefined as B);
    const query = def.query ? def.query.parse(raw.query ?? {}) : ({} as Q);
    const result = await def.run(ctx, { params: params as Params<P>, body, query, idempotencyKey });
    return { status: def.status ?? 200, body: result };
  } catch (e) {
    return errorResponse(e);
  }
}
