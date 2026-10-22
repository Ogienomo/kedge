import { NextResponse, type NextRequest } from "next/server";
import { PermissionDeniedError } from "@kedge/core";
import { supabaseServer, verifiedClaims } from "@/lib/supabase/server";
import type { ServiceContext } from "../context";
import { getDb } from "../db";
import { appEmailSender } from "../email";
import { serverEnv } from "../env";
import { executeEndpoint, type Endpoint } from "./endpoint";
import { errorResponse } from "./errors";

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

/**
 * Cookie-authenticated writes must come from our own origin (CSRF defence in
 * addition to SameSite cookies). Bearer-token clients are not affected.
 */
function assertSameOrigin(req: NextRequest, appUrl: string): void {
  if (req.method === "GET" || req.method === "HEAD" || bearerToken(req)) return;
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(appUrl).origin) {
    throw new PermissionDeniedError("same_origin", "Cross-site requests are not allowed");
  }
}

const INVALID_JSON = Symbol("invalid-json");

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

/** Adapts an Endpoint to a Next.js route handler. */
export function toRoute<P extends string, B>(def: Endpoint<P, B>) {
  return async (req: NextRequest, route: RouteContext): Promise<NextResponse> => {
    const noStore = { "cache-control": "no-store" };
    try {
      const env = serverEnv();
      assertSameOrigin(req, env.APP_URL);

      const supabase = await supabaseServer();
      const token = bearerToken(req);
      const claims = await verifiedClaims(supabase, token);

      let body: unknown = undefined;
      if (def.body) {
        body = await req.json().catch(() => INVALID_JSON);
        if (body === INVALID_JSON) body = undefined;
      }

      const ctx: ServiceContext = {
        db: getDb(),
        claims,
        now: new Date(),
        meta: {
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          userAgent: req.headers.get("user-agent"),
        },
        email: appEmailSender(env),
        appUrl: env.APP_URL,
        mfa: {
          hasVerifiedFactor: async () => {
            const { data, error } = await supabase.auth.mfa.listFactors();
            if (error) throw error;
            return data.totp.some((f) => f.status === "verified");
          },
        },
      };

      const result = await executeEndpoint(def, ctx, { params: await route.params, body });
      return NextResponse.json(result.body, { status: result.status, headers: noStore });
    } catch (e) {
      const { status, body } = errorResponse(e);
      return NextResponse.json(body, { status, headers: noStore });
    }
  };
}
