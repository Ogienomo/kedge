"use client";

import { Alert, Button, Field, Input } from "@kedge/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthHeading } from "@/components/auth-ui";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    if (password !== form.get("confirm")) {
      setError("The two passwords don't match.");
      return;
    }
    setPending(true);
    const { error: updateError } = await supabaseBrowser().auth.updateUser({ password });
    if (updateError) {
      setError(/reauthentication|aal2/i.test(updateError.message) ? "Verify your authenticator code first, then try again." : "We couldn't update your password. Request a new link and try again.");
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <AuthHeading title="Choose a new password" />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field id="password" label="New password" hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required autoFocus />
        </Field>
        <Field id="confirm" label="Confirm new password">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save password"}
        </Button>
      </form>
    </>
  );
}
