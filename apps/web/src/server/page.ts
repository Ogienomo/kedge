import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer, verifiedClaims } from "@/lib/supabase/server";
import type { ServiceContext } from "./context";
import { getDb } from "./db";
import { appEmailSender } from "./email";
import { serverEnv } from "./env";

export const CURRENT_ORG_COOKIE = "kd_org";

/**
 * Service context for server components and server actions. Redirects to
 * /login when there is no verified session.
 */
export async function pageContext(): Promise<ServiceContext & { claims: NonNullable<ServiceContext["claims"]> }> {
  const supabase = await supabaseServer();
  const env = serverEnv();
  const claims = await verifiedClaims(supabase);
  if (!claims) redirect("/login");
  if (claims.aal !== "aal2") {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2") redirect("/mfa");
  }
  return {
    db: getDb(),
    claims,
    now: new Date(),
    meta: { ip: null, userAgent: null },
    email: appEmailSender(env),
    appUrl: env.APP_URL,
    bankAccountKey: env.BANK_ACCOUNT_ENCRYPTION_KEY ?? null,
    mfa: {
      hasVerifiedFactor: async () => {
        const { data } = await supabase.auth.mfa.listFactors();
        return Boolean(data?.totp.some((f) => f.status === "verified"));
      },
    },
  };
}

/** Context for public pages (no session required). */
export function publicContext(): ServiceContext {
  const env = serverEnv();
  return {
    db: getDb(),
    claims: null,
    now: new Date(),
    meta: { ip: null, userAgent: null },
    email: appEmailSender(env),
    appUrl: env.APP_URL,
    bankAccountKey: null,
    mfa: { hasVerifiedFactor: async () => false },
  };
}

export async function currentOrgId(): Promise<string | null> {
  return (await cookies()).get(CURRENT_ORG_COOKIE)?.value ?? null;
}
