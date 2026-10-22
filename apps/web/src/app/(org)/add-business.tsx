"use client";

import { ApiRequestError } from "@kedge/api";
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, Field, Input } from "@kedge/ui";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";

export function AddBusinessButton({ orgId, isFirm, defaultOpen = false, variant = "secondary" }: { orgId: string; isFirm: boolean; defaultOpen?: boolean; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const noun = isFirm ? "client" : "business";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const legalName = String(form.get("legalName") ?? "").trim();
    const tradingName = String(form.get("tradingName") ?? "").trim();
    if (!legalName) {
      setError("Enter the registered name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const entity = await api.createEntity(orgId, { legalName, tradingName: tradingName || null });
      router.push(`/e/${entity.id}/dashboard`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : `We couldn't add the ${noun}. Please try again.`);
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Add {noun}
      </Button>
      <DialogContent>
        <DialogTitle>Add a {noun}</DialogTitle>
        <DialogDescription>This creates a new, empty set of books. You&apos;ll choose the chart of accounts and bank accounts during set-up.</DialogDescription>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {error ? <Alert tone="danger" title={error} /> : null}
          <Field id="legalName" label="Registered name" hint="As it appears on the CAC certificate.">
            <Input id="legalName" name="legalName" placeholder="Adaeze Catering Ltd" autoFocus />
          </Field>
          <Field id="tradingName" label="Trading name (optional)">
            <Input id="tradingName" name="tradingName" placeholder="Adaeze Kitchen" />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : `Add ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
