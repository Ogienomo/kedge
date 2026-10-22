"use client";

import { Alert, Button, Field, Input } from "@kedge/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Check them and try again.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first. We sent you a link when you signed up.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a minute, then try again.";
  return "We couldn't log you in. Please try again.";
}

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(linkError ? "That link is invalid or has expired. Log in or request a new one." : null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (signInError) {
      setError(friendly(signInError.message));
      setPending(false);
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
    router.replace(needsMfa ? `/mfa?next=${encodeURIComponent(next)}` : next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error ? <Alert tone="danger" title={error} /> : null}
      <Field id="email" label="Email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field id="password" label="Password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="-mt-1 text-right text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
