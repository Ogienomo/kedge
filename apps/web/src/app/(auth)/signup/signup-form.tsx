"use client";

import { Alert, Button, cn, Field, Input } from "@kedge/ui";
import { Briefcase, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Kind = "business" | "firm";

const MIN_PASSWORD = 10;

const kinds: { value: Kind; title: string; description: string; icon: typeof Store }[] = [
  { value: "business", title: "I run a business", description: "Keep my own books", icon: Store },
  { value: "firm", title: "I'm an accountant or firm", description: "Manage books for clients", icon: Briefcase },
];

export function SignupForm({ invitation }: { invitation: { token: string; email: string } | null }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("business");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const email = invitation?.email ?? String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const orgName = String(form.get("orgName") ?? "").trim();

    const next: Record<string, string> = {};
    if (!fullName) next.fullName = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address";
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters`;
    if (!invitation && !orgName) next.orgName = kind === "firm" ? "Enter your firm's name" : "Enter your business name";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    setFormError(null);
    const after = invitation ? `/invite/${invitation.token}` : "/welcome";
    const { error } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(after)}`,
        data: invitation ? { full_name: fullName } : { full_name: fullName, signup_kind: kind, org_name: orgName },
      },
    });
    if (error) {
      setFormError(/already registered/i.test(error.message) ? "An account with this email already exists. Log in instead." : "We couldn't create your account. Please try again.");
      setPending(false);
      return;
    }
    router.push(`/check-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {formError ? <Alert tone="danger" title={formError} /> : null}

      {invitation ? null : (
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">Which describes you?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {kinds.map((k) => (
              <label
                key={k.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                  kind === k.value ? "border-primary bg-accent" : "border-border-strong hover:bg-subtle",
                )}
              >
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                <k.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", kind === k.value ? "text-primary" : "text-muted")} />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{k.title}</span>
                  <span className="text-xs text-muted">{k.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Field id="fullName" label="Your name" error={errors.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" aria-invalid={Boolean(errors.fullName)} />
      </Field>
      {invitation ? null : (
        <Field id="orgName" label={kind === "firm" ? "Firm name" : "Business name"} error={errors.orgName}>
          <Input id="orgName" name="orgName" autoComplete="organization" aria-invalid={Boolean(errors.orgName)} />
        </Field>
      )}
      <Field id="email" label="Work email" error={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={invitation?.email} readOnly={Boolean(invitation)} aria-invalid={Boolean(errors.email)} />
      </Field>
      <Field id="password" label="Password" hint={`At least ${MIN_PASSWORD} characters.`} error={errors.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}
