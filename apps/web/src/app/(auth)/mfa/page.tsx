"use client";

import { Alert, Button, Field, Input } from "@kedge/ui";
import { ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { safeNext } from "@/components/auth-ui";
import { supabaseBrowser } from "@/lib/supabase/browser";

function MfaForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setPending(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (listError || !factor) {
      setError("We couldn't find your authenticator. Log in again.");
      setPending(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (verifyError) {
      setError("That code didn't work. Codes change every 30 seconds, so try the current one.");
      setPending(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error ? <Alert tone="danger" title={error} /> : null}
      <Field id="code" label="Authentication code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          placeholder="123456"
          className="tabular h-12 text-center text-lg tracking-[0.4em]"
          autoFocus
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Verifying…" : "Verify"}
      </Button>
    </form>
  );
}

export default function MfaPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
          <ShieldCheck aria-hidden className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Two-step verification</h1>
        <p className="text-sm text-muted">Open your authenticator app and enter the code for your account.</p>
      </div>
      <Suspense>
        <MfaForm />
      </Suspense>
      <form action="/auth/signout" method="post" className="text-center">
        <button type="submit" className="text-sm text-primary hover:underline">
          Use a different account
        </button>
      </form>
    </div>
  );
}
