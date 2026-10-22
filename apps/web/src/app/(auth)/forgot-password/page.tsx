"use client";

import { Alert, Button, Field, Input } from "@kedge/ui";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthHeading } from "@/components/auth-ui";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    // The result is the same whether or not the account exists, so this page
    // never reveals who has an account.
    await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
    });
    setSent(true);
    setPending(false);
  }

  return (
    <>
      <AuthHeading title="Reset your password" description="We'll email you a link to choose a new one." />
      {sent ? (
        <Alert tone="success" title="Check your email">
          If an account exists for that address, a reset link is on its way.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field id="email" label="Email">
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </Field>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
