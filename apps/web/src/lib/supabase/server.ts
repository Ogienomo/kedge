import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { AuthClaims } from "@kedge/db";
import { serverEnv } from "@/server/env";

/** Supabase client bound to the request cookies (server components, route handlers, server actions). */
export async function supabaseServer(): Promise<SupabaseClient> {
  // Reading cookies first marks the route as dynamic before anything else runs.
  const store = await cookies();
  const env = serverEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Server components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Verified claims for the current request, or null. A bearer token (mobile)
 * takes precedence over the session cookie (web). Always verifies the JWT.
 */
export async function verifiedClaims(supabase: SupabaseClient, bearer?: string | null): Promise<AuthClaims | null> {
  const { data, error } = await supabase.auth.getClaims(bearer ?? undefined);
  if (error || !data) return null;
  const { sub, email, aal } = data.claims;
  if (typeof sub !== "string" || typeof email !== "string") return null;
  return { sub, email: email.toLowerCase(), aal: aal === "aal2" ? "aal2" : "aal1" };
}
