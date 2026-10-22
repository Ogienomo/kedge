import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Pages anyone can open. Everything else requires a session. */
const PUBLIC_PATHS = ["/login", "/signup", "/check-email", "/forgot-password", "/auth/", "/invite/"];
/** Pages a signed-in user still needs while finishing authentication. */
const MID_AUTH_PATHS = ["/mfa", "/reset-password", "/auth/"];

function startsWithAny(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
}

/**
 * Refreshes the Supabase session cookie and makes optimistic redirects.
 * Authorisation itself happens in the API layer and RLS, never here.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const signedIn = Boolean(data?.claims);

  if (!signedIn && !startsWithAny(path, PUBLIC_PATHS)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }

  if (signedIn && !startsWithAny(path, MID_AUTH_PATHS) && !path.startsWith("/invite/")) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const mfa = request.nextUrl.clone();
      mfa.pathname = "/mfa";
      mfa.search = `?next=${encodeURIComponent(path)}`;
      return NextResponse.redirect(mfa);
    }
  }

  return response;
}

export const config = {
  // Skip static assets and the API (the API verifies tokens itself).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
