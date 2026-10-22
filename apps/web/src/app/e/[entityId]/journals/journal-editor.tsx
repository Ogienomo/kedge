"use client";

import { ApiRequestError, type Account, type JournalDetail } from "@kedge/api";
import { formatMoney, parseAmountInput } from "@kedge/core";
import { Alert, Button, Card, CardContent, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, Field, Input, Select, cn } from "@kedge/ui";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Amount, formatDate } from "@/components/ledger/amount";
import { useIdempotencyKey } from "@/components/ledger/use-idempotency-key";
import { api } from "@/lib/api";

interface Line {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

const blank = (): Line => ({ accountId: "", debit: "", credit: "", description: "" });

/** Minor units back to an editable figure, exactly (no floating point; rule 4). */
function toInput(minor: string): string {
  return minor === "0" ? "" : formatMoney(BigInt(minor), "NGN", { symbol: false });
}

function minorString(v: string): string {
  const m = parseAmountInput(v);
  return m === null || m < 0n ? "0" : m.toString();
}

/** SPEC §6.4 manual journal: line grid, live totals with the difference highlighted, draft or post. */
export function JournalEditor({ entityId, accounts, today, draft }: { entityId: string; accounts: Account[]; today: string; draft?: JournalDetail }) {
  const router = useRouter();
  const postable = accounts.filter((a) => a.isLeaf && a.isActive);
  const [date, setDate] = useState(draft?.entryDate ?? today);
  const [memo, setMemo] = useState(draft?.memo ?? "");
  const [lines, setLines] = useState<Line[]>(
    draft?.lines.length
      ? draft.lines.map((l) => ({ accountId: l.accountId, debit: toInput(l.debit), credit: toInput(l.credit), description: l.description ?? "" }))
      : [blank(), blank()],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"draft" | "post" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [key, renewKey] = useIdempotencyKey();

  const totals = lines.reduce(
    (t, l) => ({ debit: t.debit + (parseAmountInput(l.debit) ?? 0n), credit: t.credit + (parseAmountInput(l.credit) ?? 0n) }),
    { debit: 0n, credit: 0n },
  );
  const difference = totals.debit - totals.credit;
  const invalid = lines.some((l) => (l.debit && parseAmountInput(l.debit) === null) || (l.credit && parseAmountInput(l.credit) === null));
  const filled = lines.filter((l) => l.accountId && (l.debit || l.credit));
  const balanced = difference === 0n && totals.debit > 0n && filled.length >= 2 && !invalid;

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save(post: boolean) {
    setPending(post ? "post" : "draft");
    setError(null);
    const body = {
      entryDate: date,
      memo,
      post,
      lines: filled.map((l) => ({ accountId: l.accountId, debit: minorString(l.debit || "0"), credit: minorString(l.credit || "0"), description: l.description.trim() || null })),
    };
    try {
      let result: JournalDetail;
      if (draft) {
        result = await api.updateJournalDraft(draft.id, { ...body, post: false });
        if (post) result = await api.postJournal(draft.id, key);
      } else {
        result = await api.createJournal(entityId, body, post ? key : undefined);
      }
      renewKey();
      router.push(`/e/${entityId}/journals/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "We couldn't save the journal.");
      setConfirm(false);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-4">
      {error ? <Alert tone="danger" title={error} /> : null}
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <Field id="j-date" label="Date">
            <Input id="j-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="j-memo" label="Memo">
            <Input id="j-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. March accrual for audit fee" />
          </Field>
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Journal lines</caption>
            <thead>
              <tr className="border-b border-border bg-subtle/60 text-xs text-muted">
                <th scope="col" className="w-[38%] px-3 py-2.5 text-left font-medium">
                  Account
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Description
                </th>
                <th scope="col" className="w-36 px-3 py-2.5 text-right font-medium">
                  Debit
                </th>
                <th scope="col" className="w-36 px-3 py-2.5 text-right font-medium">
                  Credit
                </th>
                <th scope="col" className="w-10">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-2 py-1.5">
                    <Select aria-label={`Line ${i + 1} account`} value={l.accountId} onChange={(e) => update(i, { accountId: e.target.value })} className="h-9">
                      <option value="">Choose account…</option>
                      {postable.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => update(i, { description: e.target.value })} className="h-9" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label={`Line ${i + 1} debit`}
                      inputMode="decimal"
                      value={l.debit}
                      onChange={(e) => update(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                      aria-invalid={Boolean(l.debit) && parseAmountInput(l.debit) === null}
                      className="tabular h-9 text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label={`Line ${i + 1} credit`}
                      inputMode="decimal"
                      value={l.credit}
                      onChange={(e) => update(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                      aria-invalid={Boolean(l.credit) && parseAmountInput(l.credit) === null}
                      className="tabular h-9 text-right"
                    />
                  </td>
                  <td className="px-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                      <Trash2 aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="px-3 py-2.5">
                  <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>
                    <Plus aria-hidden />
                    Add line
                  </Button>
                </td>
                <td className="px-3 py-2.5 text-right text-muted">Totals</td>
                <td className="px-3 py-2.5">
                  <Amount minor={totals.debit} className="block" />
                </td>
                <td className="px-3 py-2.5">
                  <Amount minor={totals.credit} className="block" />
                </td>
                <td />
              </tr>
              <tr>
                <td colSpan={2} />
                <td colSpan={2} className={cn("px-3 pb-3 text-right text-sm", difference === 0n ? "text-success" : "font-medium text-danger")} aria-live="polite">
                  {difference === 0n ? (totals.debit > 0n ? "Balanced" : "") : <>Difference: <Amount minor={difference < 0n ? -difference : difference} /></>}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => save(false)} disabled={pending !== null || filled.length === 0 || invalid}>
          {pending === "draft" ? "Saving…" : "Save draft"}
        </Button>
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <Button onClick={() => setConfirm(true)} disabled={!balanced || pending !== null}>
            Post
          </Button>
          <DialogContent>
            <DialogTitle>Post this journal?</DialogTitle>
            <DialogDescription>
              {filled.length} lines totalling <Amount minor={totals.debit} /> will be posted on {date ? formatDate(date) : "the chosen date"} and given the next journal number. Posted entries cannot be edited
              or deleted, only reversed.
            </DialogDescription>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button onClick={() => save(true)} disabled={pending !== null}>
                {pending === "post" ? "Posting…" : "Post journal"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
