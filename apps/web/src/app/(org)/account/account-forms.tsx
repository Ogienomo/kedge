"use client";

import { Alert, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, Input } from "@kedge/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Status = { tone: "success" | "danger"; text: string } | null;

export function ProfileForm({ fullName }: { fullName: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await api.updateProfile({ fullName: String(new FormData(e.currentTarget).get("fullName") ?? "").trim() || null });
      setStatus({ tone: "success", text: "Saved." });
      router.refresh();
    } catch {
      setStatus({ tone: "danger", text: "We couldn't save your profile." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {status ? <Alert tone={status.tone} title={status.text} /> : null}
          <Field id="fullName" label="Full name">
            <Input id="fullName" name="fullName" defaultValue={fullName ?? ""} autoComplete="name" />
          </Field>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const password = String(new FormData(formEl).get("password") ?? "");
    if (password.length < 10) {
      setStatus({ tone: "danger", text: "Use at least 10 characters." });
      return;
    }
    setPending(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setPending(false);
    if (error) {
      setStatus({ tone: "danger", text: /reauthentication/i.test(error.message) ? "For your security, log out and back in, then change your password." : "We couldn't change your password." });
      return;
    }
    formEl.reset();
    setStatus({ tone: "success", text: "Password changed." });
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {status ? <Alert tone={status.tone} title={status.text} /> : null}
          <Field id="new-password" label="New password" hint="At least 10 characters.">
            <Input id="new-password" name="password" type="password" autoComplete="new-password" />
          </Field>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Changing…" : "Change password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function SessionsSection() {
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>Sessions expire after 12 hours. If you used a shared computer, sign out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? <Alert tone="success" title="You've been signed out on every other device." /> : null}
      </CardContent>
      <CardFooter>
        <Button
          variant="secondary"
          disabled={pending || done}
          onClick={async () => {
            setPending(true);
            const { error } = await supabaseBrowser().auth.signOut({ scope: "others" });
            setPending(false);
            setDone(!error);
          }}
        >
          Sign out of other devices
        </Button>
      </CardFooter>
    </Card>
  );
}
