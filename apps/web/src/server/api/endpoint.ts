import { NotFoundError, UnauthenticatedError } from "@kedge/core";
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
export interface Endpoint<P extends string = never, B = undefined> {
  readonly auth: "required" | "public";
  readonly params?: readonly P[];
  readonly body?: z.ZodType<B>;
  readonly status?: number;
  /** Only for endpoints that must work mid-login (e.g. syncing MFA state). */
  readonly allowBeforeMfa?: boolean;
  readonly run: (ctx: ServiceContext, input: { params: Params<P>; body: B }) => Promise<unknown>;
}

export function endpoint<P extends string = never, B = undefined>(def: Endpoint<P, B>): Endpoint<P, B> {
  return def;
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

export async function executeEndpoint<P extends string, B>(
  def: Endpoint<P, B>,
  ctx: ServiceContext,
  raw: { params: Record<string, string | string[] | undefined>; body: unknown },
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

    const body = def.body ? def.body.parse(raw.body) : (undefined as B);
    const result = await def.run(ctx, { params: params as Params<P>, body });
    return { status: def.status ?? 200, body: result };
  } catch (e) {
    return errorResponse(e);
  }
}
