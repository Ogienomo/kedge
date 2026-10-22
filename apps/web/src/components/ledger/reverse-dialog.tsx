"use client";

import { ApiRequestError } from "@kedge/api";
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, Field, Input } from "@kedge/ui";
import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useIdempotencyKey } from "./use-idempotency-key";

/**
 * Reversal (rule 3): posted entries are never edited. Confirmation says
 * exactly what will happen; a reason is required and recorded.
 */
export function ReverseDialog({
  what,
  description,
  onReverse,
  redirectTo,
}: {
  what: string;
  description: ReactNode;
  onReverse: (reason: string, idempotencyKey: string) => Promise<{ redirect?: string } | void>;
  redirectTo?: (result: { redirect?: string } | void) => string | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [key, renewKey] = useIdempotencyKey();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return setError("Give a reason. It is kept in the audit trail.");
    setPending(true);
    setError(null);
    try {
      const result = await onReverse(reason.trim(), key);
      renewKey();
      setOpen(false);
      const to = redirectTo?.(result);
      if (to) router.push(to);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "We couldn't reverse it. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Undo2 aria-hidden />
        Reverse
      </Button>
      <DialogContent>
        <DialogTitle>Reverse this {what}?</DialogTitle>
        <DialogDescription asChild>
          <div className="grid gap-2 text-sm text-muted">{description}</div>
        </DialogDescription>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {error ? <Alert tone="danger" title={error} /> : null}
          <Field id="reverse-reason" label="Reason">
            <Input id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Recorded in the wrong category" autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Reversing…" : "Reverse"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
