"use client";

import { ApiRequestError, type Account } from "@kedge/api";
import { addDays, parseAmountInput } from "@kedge/core";
import { Alert, Button, Input, Skeleton } from "@kedge/ui";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Amount, formatDate } from "../ledger/amount";
import { useIdempotencyKey } from "../ledger/use-idempotency-key";

const GROUPS: { title: string; simpleTitle: string; match: (a: Account) => boolean }[] = [
  { title: "Assets", simpleTitle: "What the business owns", match: (a) => a.type === "asset" },
  { title: "Liabilities", simpleTitle: "What the business owes", match: (a) => a.type === "liability" },
  { title: "Equity", simpleTitle: "The owners' stake", match: (a) => a.type === "equity" },
];

/**
 * Manual opening balances (SPEC §4.8): one figure per balance sheet account,
 * in its normal direction. Enter a negative figure for a contra balance (for
 * example accumulated depreciation). Any difference goes to opening balance
 * equity, which must reach zero for set-up to be complete.
 */
export function OpeningBalancesForm({ entityId, goLiveDate, simple, onDone }: { entityId: string; goLiveDate: string; simple: boolean; onDone: () => void }) {
  const accounts = useQuery({ queryKey: ["accounts", entityId], queryFn: () => api.listAccounts(entityId) });
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [key, renewKey] = useIdempotencyKey();

  if (accounts.isPending) return <Skeleton className="h-64" />;
  if (accounts.isError) return <Alert tone="danger" title="We couldn't load your accounts" />;

  const list = accounts.data.accounts.filter((a) => a.isLeaf && a.isActive && ["asset", "liability", "equity"].includes(a.type) && a.systemKey !== "opening_balance_equity");
  const parsed = new Map(list.map((a) => [a.id, parseAmountInput(values[a.id] ?? "") ?? 0n]));
  const invalid = list.filter((a) => (values[a.id] ?? "").trim() !== "" && parseAmountInput(values[a.id] ?? "") === null);
  const totalOf = (type: string) => list.filter((a) => a.type === type).reduce((s, a) => s + (parsed.get(a.id) ?? 0n), 0n);
  const assets = totalOf("asset");
  const claims = totalOf("liability") + totalOf("equity");
  const difference = assets - claims;
  const dayBefore = formatDate(addDays(goLiveDate, -1));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (invalid.length > 0) return setError(`Check the amount for ${invalid[0]?.name}.`);
    const balances = list
      .map((a) => ({ a, v: parsed.get(a.id) ?? 0n }))
      .filter(({ v }) => v !== 0n)
      .map(({ a, v }) => {
        // Normal direction: assets are debits, liabilities and equity credits. A negative figure flips the side.
        const debitSide = (a.type === "asset") === v > 0n;
        const abs = v < 0n ? -v : v;
        return { accountId: a.id, debit: debitSide ? abs.toString() : "0", credit: debitSide ? "0" : abs.toString() };
      });
    if (balances.length === 0) return setError("Enter at least one balance, or skip this step.");
    setPending(true);
    setError(null);
    try {
      await api.postOpeningBalances(entityId, { balances }, key);
      renewKey();
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "We couldn't save the opening balances. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <p className="text-sm text-muted">
        {simple ? "Enter what each account held" : "Enter closing balances"} at the end of <strong className="text-foreground">{dayBefore}</strong>, the day before you start
        recording here. Leave blank anything that was zero.
      </p>
      {error ? <Alert tone="danger" title={error} /> : null}
      {GROUPS.map((g) => {
        const rows = list.filter(g.match);
        if (rows.length === 0) return null;
        return (
          <fieldset key={g.title} className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">{simple ? g.simpleTitle : g.title}</legend>
            {rows.map((a) => (
              <label key={a.id} className="grid grid-cols-[1fr_9rem] items-center gap-3 sm:grid-cols-[1fr_11rem]">
                <span className="truncate text-sm">
                  {simple ? null : <span className="mr-2 text-muted tabular">{a.code}</span>}
                  {a.name}
                </span>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={values[a.id] ?? ""}
                  aria-invalid={invalid.includes(a)}
                  onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))}
                  className="tabular h-9 text-right"
                  aria-label={`Opening balance for ${a.name}`}
                />
              </label>
            ))}
          </fieldset>
        );
      })}
      <div className="grid gap-1 rounded-lg bg-subtle p-3 text-sm">
        <div className="flex justify-between">
          <span>{simple ? "Owns" : "Total assets"}</span>
          <Amount minor={assets} />
        </div>
        <div className="flex justify-between">
          <span>{simple ? "Owes, plus owners' stake" : "Total liabilities and equity"}</span>
          <Amount minor={claims} />
        </div>
        <div className="flex justify-between border-t border-border pt-1 font-medium">
          <span>{simple ? "Difference" : "Opening balance equity"}</span>
          <Amount minor={difference < 0n ? -difference : difference} negative="minus" />
        </div>
        {difference !== 0n ? (
          <p className="text-xs text-warning">The difference will sit in “Opening balance equity” until you correct it. Set-up isn&apos;t complete until it is zero.</p>
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save opening balances"}
        </Button>
      </div>
    </form>
  );
}
