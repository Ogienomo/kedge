"use client";

import { ApiRequestError, type Account, type EntitySummary, type TaxCodeDto } from "@kedge/api";
import { compileTransaction, isInForce, parseAmountInput, type LedgerAccount, type TaxCode, type TransactionKind } from "@kedge/core";
import { Alert, Button, cn, Dialog, DialogContent, DialogDescription, DialogTitle, Field, Input, Select, Skeleton } from "@kedge/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatNaira } from "../ledger/amount";
import { useIdempotencyKey } from "../ledger/use-idempotency-key";

type Tab = "money_in" | "money_out" | "transfer" | "other";
type OtherKind = "owner_in" | "owner_out" | "loan_in" | "loan_repay";

const TABS: { value: Tab; label: string }[] = [
  { value: "money_in", label: "Money in" },
  { value: "money_out", label: "Money out" },
  { value: "transfer", label: "Transfer" },
  { value: "other", label: "Other" },
];

const OTHER: { value: OtherKind; label: string }[] = [
  { value: "owner_in", label: "Owner put money in" },
  { value: "owner_out", label: "Owner took money out" },
  { value: "loan_in", label: "Loan received" },
  { value: "loan_repay", label: "Loan repayment" },
];

function toLedger(a: Account): LedgerAccount {
  return { id: a.id, code: a.code, name: a.name, type: a.type, subtype: a.subtype as LedgerAccount["subtype"], isLeaf: a.isLeaf, isActive: a.isActive, systemKey: a.systemKey };
}

function toTax(t: TaxCodeDto, accounts: Account[]): TaxCode {
  const sys = (k: string) => accounts.find((a) => a.systemKey === k)?.id ?? null;
  return {
    id: t.id,
    codeKey: t.codeKey,
    kind: t.kind,
    name: t.name,
    rateBps: t.rateBps,
    effectiveFrom: t.effectiveFrom,
    effectiveTo: t.effectiveTo,
    appliesTo: t.appliesTo,
    recoverable: t.recoverable,
    outputAccountId: t.kind === "vat" ? sys("vat_output") : sys("wht_payable"),
    inputAccountId: t.kind === "vat" ? sys("vat_input") : sys("wht_receivable"),
  };
}

/** 750 → "7.5%" with integer arithmetic. */
const pct = (bps: number) => `${Math.trunc(bps / 100)}${bps % 100 ? `.${String(bps % 100).padStart(2, "0").replace(/0$/, "")}` : ""}%`;

/** Quick add (SPEC §6.4): records a simple-mode transaction through the posting map. */
export function QuickAdd({ entity, open, onOpenChange }: { entity: EntitySummary; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const simple = entity.displayMode === "simple";
  const canPost = entity.permissions.includes("transaction.post");

  const data = useQuery({
    queryKey: ["quick-add", entity.id],
    enabled: open,
    queryFn: async () => {
      const [detail, accounts, banks, taxes, contacts] = await Promise.all([
        api.getEntity(entity.id),
        api.listAccounts(entity.id),
        api.listBankAccounts(entity.id),
        api.listTaxCodes(entity.id),
        api.listContacts(entity.id),
      ]);
      return { detail, accounts: accounts.accounts, banks: banks.bankAccounts.filter((b) => b.isActive), taxes: taxes.taxCodes, contacts: contacts.contacts };
    },
  });

  const [tab, setTab] = useState<Tab>("money_in");
  const [other, setOther] = useState<OtherKind>("owner_in");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [bankId, setBankId] = useState("");
  const [counterId, setCounterId] = useState("");
  const [contactName, setContactName] = useState("");
  const [vatOn, setVatOn] = useState(false);
  const [includesVat, setIncludesVat] = useState(true);
  const [whtId, setWhtId] = useState("");
  const [interest, setInterest] = useState("");
  const [interestAccountId, setInterestAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [key, renewKey] = useIdempotencyKey();

  const kind: TransactionKind = tab === "other" ? other : tab;
  const d = data.data;
  const today = d?.detail.today ?? "";
  const txnDate = date || today;
  const bank = d?.banks.find((b) => b.id === bankId) ?? d?.banks.find((b) => b.kind !== "cash") ?? d?.banks[0];

  const leaf = (pred: (a: Account) => boolean) => (d?.accounts ?? []).filter((a) => a.isLeaf && a.isActive && pred(a));
  const categories = useMemo(() => {
    switch (kind) {
      case "money_in":
        return leaf((a) => a.type === "income" && a.systemKey !== "fx_gain_loss");
      case "money_out":
        return leaf((a) => a.type === "expense" && a.systemKey !== "rounding");
      case "transfer":
        return leaf((a) => (a.subtype === "bank" || a.subtype === "cash") && a.id !== bank?.ledgerAccountId && (d?.banks.some((b) => b.ledgerAccountId === a.id) ?? false));
      case "owner_in":
        return leaf((a) => a.subtype === "equity_capital" && a.systemKey !== "opening_balance_equity");
      case "owner_out":
        return leaf((a) => a.subtype === "drawings");
      case "loan_in":
      case "loan_repay":
        return leaf((a) => (a.subtype === "current_liability" || a.subtype === "non_current_liability") && !a.systemKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, d, bank?.ledgerAccountId]);
  const counter = categories.find((a) => a.id === counterId) ?? (categories.length === 1 ? categories[0] : undefined);

  const taxed = kind === "money_in" || kind === "money_out";
  const vatCode = useMemo(() => {
    const t = d?.taxes.find((x) => x.codeKey === "VAT_STANDARD" && txnDate && isInForce(x, txnDate));
    return t && d ? toTax(t, d.accounts) : null;
  }, [d, txnDate]);
  const whtCodes = (d?.taxes ?? []).filter((t) => t.kind === "wht" && txnDate && isInForce(t, txnDate));
  const whtCode = useMemo(() => {
    const t = whtCodes.find((x) => x.id === whtId);
    return t && d ? toTax(t, d.accounts) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whtId, d, txnDate]);
  const financeCosts = leaf((a) => a.subtype === "finance_cost");

  const minor = parseAmountInput(amount);
  const interestMinor = kind === "loan_repay" ? (parseAmountInput(interest || "0") ?? null) : 0n;

  // Live preview through the same posting map the server uses (rule 12).
  const preview = useMemo(() => {
    if (!d || !bank || !counter || minor === null || minor <= 0n || interestMinor === null) return null;
    try {
      return compileTransaction(
        {
          kind,
          txnDate,
          amount: minor,
          bankAccountId: bank.ledgerAccountId,
          counterAccountId: counter.id,
          vat: taxed && vatOn ? vatCode : null,
          wht: taxed ? whtCode : null,
          amountsIncludeTax: includesVat,
          interest: interestMinor,
          interestAccountId: interestAccountId || financeCosts[0]?.id || null,
        },
        new Map(d.accounts.map((a) => [a.id, toLedger(a)])),
      );
    } catch (e) {
      return e instanceof Error ? e.message : null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, bank, counter, minor, kind, txnDate, vatOn, vatCode, whtCode, includesVat, interestMinor, interestAccountId]);

  function reset() {
    setAmount("");
    setReference("");
    setContactName("");
    setInterest("");
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!d || !bank) return;
    if (minor === null || minor <= 0n) return setError("Enter an amount greater than zero.");
    if (!counter) return setError(kind === "transfer" ? "Choose where the money went." : "Choose a category.");
    setPending(true);
    setError(null);
    try {
      let contactId: string | null = null;
      const name = contactName.trim();
      if (name) {
        const existing = d.contacts.find((c) => c.name.toLowerCase() === name.toLowerCase());
        contactId = existing
          ? existing.id
          : (await api.createContact(entity.id, { name, kind: kind === "money_in" ? "customer" : kind === "money_out" ? "supplier" : "other" })).id;
      }
      await api.createTransaction(
        entity.id,
        {
          kind,
          txnDate,
          amount: minor.toString(),
          bankAccountId: bank.id,
          counterAccountId: counter.id,
          contactId,
          taxCodeId: taxed && vatOn && vatCode ? vatCode.id : null,
          whtCodeId: taxed && whtCode ? whtCode.id : null,
          amountsIncludeTax: includesVat,
          interestAmount: kind === "loan_repay" ? (interestMinor ?? 0n).toString() : null,
          interestAccountId: kind === "loan_repay" ? interestAccountId || financeCosts[0]?.id || null : null,
          reference: reference.trim() || null,
          post: canPost,
        },
        key,
      );
      renewKey();
      reset();
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["quick-add", entity.id] });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "We couldn't record that. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const accountName = (id: string) => d?.accounts.find((a) => a.id === id)?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle>Record something</DialogTitle>
        <DialogDescription className="sr-only">Record money in, money out, a transfer or another movement of money.</DialogDescription>
        {data.isPending ? (
          <div className="grid gap-3" aria-busy="true">
            <Skeleton className="h-9" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : data.isError || !d ? (
          <Alert tone="danger" title="We couldn't load your categories">
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => data.refetch()}>
              Try again
            </button>
          </Alert>
        ) : !d.detail.booksReady ? (
          <Alert tone="info" title="Set up the books first">
            Recording opens once this business has its categories and bank accounts.
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <div role="tablist" aria-label="What happened" className="grid grid-cols-4 rounded-lg border border-border bg-subtle p-0.5">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.value}
                  onClick={() => {
                    setTab(t.value);
                    setCounterId("");
                    setWhtId("");
                  }}
                  className={cn("rounded-md px-2 py-1.5 text-xs font-medium sm:text-sm", tab === t.value ? "bg-surface shadow-card" : "text-muted hover:text-foreground")}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {error ? <Alert tone="danger" title={error} /> : null}

            {tab === "other" ? (
              <Field id="qa-other" label="What happened">
                <Select id="qa-other" value={other} onChange={(e) => (setOther(e.target.value as OtherKind), setCounterId(""))}>
                  {OTHER.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="qa-amount" label={kind === "loan_repay" ? "Total paid" : "Amount (₦)"}>
                <Input id="qa-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular text-right" autoFocus />
              </Field>
              <Field id="qa-date" label="Date">
                <Input id="qa-date" type="date" value={txnDate} max={today} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="qa-bank" label={kind === "transfer" ? "From" : kind === "money_in" || kind === "owner_in" || kind === "loan_in" ? "Into" : "Paid from"}>
                <Select id="qa-bank" value={bank?.id ?? ""} onChange={(e) => setBankId(e.target.value)}>
                  {d.banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName === "Cash" ? b.accountName : `${b.bankName} – ${b.accountName}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="qa-counter" label={kind === "transfer" ? "To" : kind === "loan_in" || kind === "loan_repay" ? "Loan" : simple || taxed ? "Category" : "Account"}>
                <Select id="qa-counter" value={counter?.id ?? ""} onChange={(e) => setCounterId(e.target.value)}>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {categories.map((a) => (
                    <option key={a.id} value={a.id}>
                      {simple ? a.name : `${a.code} · ${a.name}`}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {kind === "loan_repay" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="qa-interest" label="Of which interest (₦)">
                  <Input id="qa-interest" inputMode="decimal" placeholder="0.00" value={interest} onChange={(e) => setInterest(e.target.value)} className="tabular text-right" />
                </Field>
                {financeCosts.length > 1 ? (
                  <Field id="qa-interest-account" label="Interest category">
                    <Select id="qa-interest-account" value={interestAccountId || financeCosts[0]?.id} onChange={(e) => setInterestAccountId(e.target.value)}>
                      {financeCosts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </div>
            ) : null}

            {kind !== "transfer" ? (
              <Field id="qa-contact" label={kind === "money_in" ? "Customer (optional)" : kind === "money_out" ? "Supplier (optional)" : "Who (optional)"}>
                <Input id="qa-contact" list="qa-contacts" autoComplete="off" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Start typing a name" />
                <datalist id="qa-contacts">
                  {d.contacts.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </Field>
            ) : null}

            {taxed && (d.detail.vatRegistered || whtCodes.length > 0) ? (
              <fieldset className="grid gap-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-xs font-medium text-muted">Tax</legend>
                {d.detail.vatRegistered && vatCode ? (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
                      VAT {pct(vatCode.rateBps)}
                    </label>
                    {vatOn ? (
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={includesVat} onChange={(e) => setIncludesVat(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
                        Amount includes VAT
                      </label>
                    ) : null}
                  </div>
                ) : null}
                {whtCodes.length > 0 ? (
                  <Field id="qa-wht" label={kind === "money_in" ? "Customer deducted tax (WHT)" : "We deducted tax (WHT)"}>
                    <Select id="qa-wht" value={whtId} onChange={(e) => setWhtId(e.target.value)}>
                      <option value="">No WHT</option>
                      {whtCodes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({pct(t.rateBps)})
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </fieldset>
            ) : null}

            <Field id="qa-ref" label="Reference (optional)">
              <Input id="qa-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice or receipt number" />
            </Field>

            {preview && typeof preview !== "string" ? (
              <div className="rounded-lg bg-subtle p-3 text-sm" aria-live="polite">
                <p className="mb-2 text-xs font-medium text-muted">This will record:</p>
                {simple ? (
                  <p>
                    {preview.breakdown.bank > 0n ? (kind === "money_in" || kind === "owner_in" || kind === "loan_in" ? "Received " : "Paid ") : null}
                    <strong className="tabular">{formatNaira(preview.breakdown.bank)}</strong> {kind === "money_in" || kind === "owner_in" || kind === "loan_in" ? "into" : "from"} {bank?.accountName}
                    {preview.breakdown.vat > 0n ? `, including ${formatNaira(preview.breakdown.vat)} VAT` : ""}
                    {preview.breakdown.wht > 0n ? `, after ${formatNaira(preview.breakdown.wht)} tax withheld` : ""}.
                  </p>
                ) : (
                  <table className="w-full">
                    <caption className="sr-only">Journal preview</caption>
                    <thead>
                      <tr className="text-xs text-muted">
                        <th scope="col" className="text-left font-normal">
                          Account
                        </th>
                        <th scope="col" className="text-right font-normal">
                          Debit
                        </th>
                        <th scope="col" className="text-right font-normal">
                          Credit
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.draft.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="py-0.5 pr-2">{accountName(l.accountId)}</td>
                          <td className="amount">{l.debit > 0n ? formatNaira(l.debit) : ""}</td>
                          <td className="amount pl-3">{l.credit > 0n ? formatNaira(l.credit) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : typeof preview === "string" ? (
              <p className="text-xs text-danger" role="status">
                {preview}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || typeof preview === "string"}>
                {pending ? "Recording…" : canPost ? "Record" : "Save for review"}
              </Button>
            </div>
            {!canPost ? <p className="text-xs text-muted">Your role records drafts; an owner or accountant posts them.</p> : null}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
