"use client";

import { ApiRequestError, type FiscalYear } from "@kedge/api";
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, Field, Input, cn } from "@kedge/ui";
import { Lock, LockOpen, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatDate } from "@/components/ledger/amount";
import { api } from "@/lib/api";

type Period = FiscalYear["periods"][number];

const monthFmt = new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });
const monthName = (p: Period) => monthFmt.format(new Date(`${p.startDate}T00:00:00Z`));

export function PeriodsView({ entityId, fiscalYears, today, canLock, canUnlock, canAddYear }: { entityId: string; fiscalYears: FiscalYear[]; today: string; canLock: boolean; canUnlock: boolean; canAddYear: boolean }) {
  const router = useRouter();
  const [action, setAction] = useState<{ period: Period; kind: "lock" | "unlock" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!action) return;
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
    if (action.kind === "unlock" && !reason) return setError("Give a reason for unlocking. It is kept in the audit trail.");
    setPending(true);
    setError(null);
    try {
      if (action.kind === "lock") await api.lockPeriod(action.period.id, reason || null);
      else await api.unlockPeriod(action.period.id, reason);
      setAction(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "That didn't work. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      {canAddYear ? (
        <Button
          variant="secondary"
          className="w-fit justify-self-end"
          onClick={async () => {
            await api.addFiscalYear(entityId);
            router.refresh();
          }}
        >
          <Plus aria-hidden />
          Add next financial year
        </Button>
      ) : null}
      {fiscalYears.map((fy) => (
        <Card key={fy.id}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              {formatDate(fy.startDate)} – {formatDate(fy.endDate)}
            </CardTitle>
            <Badge tone={fy.status === "open" ? "primary" : "neutral"}>{fy.status === "open" ? "Open year" : "Closed year"}</Badge>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {fy.periods.map((p) => {
                const current = today >= p.startDate && today <= p.endDate;
                return (
                  <li key={p.id} className={cn("flex items-center gap-3 rounded-lg border p-3", current ? "border-primary/50" : "border-border")}>
                    {p.status === "open" ? <LockOpen aria-hidden className="size-4 text-muted" /> : <Lock aria-hidden className="size-4 text-warning" />}
                    <div className="grid min-w-0 flex-1">
                      <span className="text-sm font-medium">{monthName(p)}</span>
                      <span className="truncate text-xs text-muted">
                        {p.status === "open" ? (current ? "Current period" : "Open") : p.status === "locked" ? `Locked${p.lockReason ? ` · ${p.lockReason}` : ""}` : "Closed"}
                      </span>
                    </div>
                    {p.status === "open" && canLock ? (
                      <Button variant="ghost" size="sm" onClick={() => (setError(null), setAction({ period: p, kind: "lock" }))}>
                        Lock
                      </Button>
                    ) : p.status === "locked" && canUnlock ? (
                      <Button variant="ghost" size="sm" onClick={() => (setError(null), setAction({ period: p, kind: "unlock" }))}>
                        Unlock
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}

      <Dialog open={action !== null} onOpenChange={(o) => (o ? null : setAction(null))}>
        <DialogContent>
          {action ? (
            <>
              <DialogTitle>
                {action.kind === "lock" ? "Lock" : "Unlock"} {monthName(action.period)}?
              </DialogTitle>
              <DialogDescription>
                {action.kind === "lock"
                  ? `Nothing can be posted, reversed or imported with a date from ${formatDate(action.period.startDate)} to ${formatDate(action.period.endDate)} until it is unlocked. Reversals of entries in this month will be dated in the next open month.`
                  : `Entries dated in ${monthName(action.period)} can be posted again. Reports for this month may change. Your reason is recorded in the audit log.`}
              </DialogDescription>
              <form onSubmit={onSubmit} className="grid gap-4" noValidate>
                {error ? <Alert tone="danger" title={error} /> : null}
                <Field id="period-reason" label={action.kind === "lock" ? "Note (optional)" : "Reason"}>
                  <Input id="period-reason" name="reason" autoFocus placeholder={action.kind === "lock" ? "e.g. Month reviewed and reconciled" : "e.g. Late supplier invoice"} />
                </Field>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setAction(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant={action.kind === "unlock" ? "danger" : "primary"} disabled={pending}>
                    {pending ? "Saving…" : action.kind === "lock" ? "Lock period" : "Unlock period"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
