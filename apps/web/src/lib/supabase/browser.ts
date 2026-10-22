"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Browser Supabase client: used only for authentication (sign-in, MFA, password). */
export function supabaseBrowser(): SupabaseClient {
  client ??= createBrowserClient(requirePublic("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL), requirePublic("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
  return client;
}

function requirePublic(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
