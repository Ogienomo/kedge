"use client";

import { ApiRequestError } from "@kedge/api";
import { Alert, Button, cn, Field, Input } from "@kedge/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { selectOrganisation } from "@/server/actions";

export function WelcomeForm({ defaultKind, defaultName, firstName }: { defaultKind: "business" | "firm"; defaultName: string; firstName: string | null }) {
  const router = useRouter();
  const [kind, setKind] = useState(defaultKind);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) {
      setError(kind === "firm" ? "Enter your firm's name." : "Enter your business name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const ctx = await api.createOrganisation({ name, kind });
      await selectOrganisation(ctx.organisation.id);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "We couldn't finish setting up. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{firstName ? `Welcome, ${firstName}` : "Welcome"}</h1>
        <p className="text-sm text-muted">Your email is confirmed. One last step: confirm the name we&apos;ll use for your account.</p>
      </div>
      {error ? <Alert tone="danger" title={error} /> : null}
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-1.5 text-sm font-medium">Account type</legend>
        {(["business", "firm"] as const).map((k) => (
          <label
            key={k}
            className={cn(
              "cursor-pointer rounded-lg border px-3 py-2.5 text-center text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
              kind === k ? "border-primary bg-accent text-accent-foreground" : "border-border-strong hover:bg-subtle",
            )}
          >
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {k === "business" ? "Business" : "Accounting firm"}
          </label>
        ))}
      </fieldset>
      <Field id="name" label={kind === "firm" ? "Firm name" : "Business name"}>
        <Input id="name" name="name" defaultValue={defaultName} autoComplete="organization" autoFocus />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Setting up…" : "Continue"}
      </Button>
    </form>
  );
}
