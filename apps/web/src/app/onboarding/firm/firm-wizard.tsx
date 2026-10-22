"use client";

import { ApiRequestError, type Invitation, type InvitationOptions } from "@kedge/api";
import { Alert, Button, Card, CardContent, cn, Field, Input } from "@kedge/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { InvitationsPanel } from "@/app/(org)/org/settings/invitations-panel";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { api } from "@/lib/api";

const STEPS = ["Your firm", "First client", "Your team"] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;

export function FirmWizard({
  orgId,
  name: initialName,
  brandColour,
  canCreate,
  today,
  options,
  invitations,
}: {
  orgId: string;
  name: string;
  brandColour: string | null;
  canCreate: boolean;
  today: string;
  options: InvitationOptions;
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [colour, setColour] = useState(brandColour ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter the firm's name.");
    if (colour && !HEX.test(colour)) return setError("Use a colour like #1F6FEB, or leave it blank.");
    setPending(true);
    setError(null);
    try {
      await api.updateOrganisation(orgId, { name: name.trim(), brandColour: colour || null });
      router.refresh();
      setStep(canCreate ? 1 : 2);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "We couldn't save your firm's details. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <ol className="mb-6 flex items-center gap-1.5" aria-label="Firm set-up progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={i === step ? "step" : undefined}>
            <span className={cn("h-1.5 rounded-full", i < step ? "bg-primary" : i === step ? "bg-primary/60" : "bg-subtle")} />
            <span className={cn("truncate text-xs", i === step ? "font-medium text-foreground" : "text-muted")}>{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <Card>
          <CardContent>
            <form onSubmit={saveDetails} className="grid gap-5" noValidate>
              <div className="grid gap-1">
                <h2 className="text-xl font-semibold tracking-tight">About your firm</h2>
                <p className="text-sm text-muted">Your name and colour appear on client reports.</p>
              </div>
              {error ? <Alert tone="danger" title={error} /> : null}
              <Field id="firmName" label="Firm name">
                <Input id="firmName" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </Field>
              <Field id="brandColour" label="Brand colour (optional)" hint="A hex colour, for example #1F6FEB.">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pick a brand colour"
                    value={HEX.test(colour) ? colour : "#1F6FEB"}
                    onChange={(e) => setColour(e.target.value.toUpperCase())}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border-strong bg-surface p-1"
                  />
                  <Input id="brandColour" value={colour} onChange={(e) => setColour(e.target.value.trim())} placeholder="#1F6FEB" className="font-mono" maxLength={7} />
                </div>
              </Field>
              <p className="text-xs text-muted">You can add a logo from organisation settings once file uploads are available.</p>
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Continue"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-3">
          <SetupWizard orgId={orgId} today={today} noun="client" onComplete={() => setStep(2)} />
          <Button variant="ghost" className="justify-self-center" onClick={() => setStep(2)}>
            Add a client later
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold tracking-tight">Invite your team</h2>
            <p className="text-sm text-muted">Add colleagues now, or later from organisation settings.</p>
          </div>
          <InvitationsPanel orgId={orgId} options={options} invitations={invitations} />
          <Button className="justify-self-end" onClick={() => router.push("/practice")}>
            Go to your clients
          </Button>
        </div>
      ) : null}
    </div>
  );
}
