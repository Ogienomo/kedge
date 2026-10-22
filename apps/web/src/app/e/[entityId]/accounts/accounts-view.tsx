"use client";

import { ApiRequestError, type Account, type BankAccount } from "@kedge/api";
import { SUBTYPES_BY_TYPE, type AccountType } from "@kedge/core";
import { Alert, Badge, Button, Card, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, Field, Input, Select, cn } from "@kedge/ui";
import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Amount } from "@/components/ledger/amount";
import { api } from "@/lib/api";

const GROUPS: { type: AccountType; title: string; simpleTitle: string }[] = [
  { type: "income", title: "Income", simpleTitle: "Money in" },
  { type: "expense", title: "Expenses", simpleTitle: "Money out" },
  { type: "asset", title: "Assets", simpleTitle: "What the business owns" },
  { type: "liability", title: "Liabilities", simpleTitle: "What the business owes" },
  { type: "equity", title: "Equity", simpleTitle: "The owners' stake" },
];

const SUBTYPE_LABEL: Record<string, string> = {
  current_asset: "Current asset",
  non_current_asset: "Non-current asset",
  bank: "Bank",
  cash: "Cash",
  receivable: "Receivable",
  inventory: "Inventory",
  current_liability: "Current liability",
  non_current_liability: "Non-current liability",
  payable: "Payable",
  tax_payable: "Tax payable",
  equity_capital: "Capital",
  retained_earnings: "Retained earnings",
  drawings: "Drawings",
  revenue: "Revenue",
  other_income: "Other income",
  cost_of_sales: "Cost of sales",
  operating_expense: "Operating expense",
  finance_cost: "Finance cost",
  income_tax_expense: "Income tax",
};

function depth(a: Account, byId: Map<string, Account>): number {
  let d = 0;
  let p = a.parentId ? byId.get(a.parentId) : undefined;
  while (p) {
    d++;
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  return d;
}

export function AccountsView({ entityId, accounts, bankAccounts, simple, canEdit }: { entityId: string; accounts: Account[]; bankAccounts: BankAccount[]; simple: boolean; canEdit: boolean }) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const [showInactive, setShowInactive] = useState(false);
  const masked = new Map(bankAccounts.map((b) => [b.ledgerAccountId, b.accountNumberMasked]));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
          Show deactivated
        </label>
        {canEdit ? <AddAccount entityId={entityId} accounts={accounts} simple={simple} /> : null}
      </div>
      {GROUPS.map((g) => {
        const rows = accounts.filter((a) => a.type === g.type && (showInactive || a.isActive));
        if (rows.length === 0) return null;
        return (
          <Card key={g.type} className="overflow-hidden">
            <h2 className="border-b border-border bg-subtle/60 px-4 py-2.5 text-sm font-semibold">{simple ? g.simpleTitle : g.title}</h2>
            <ul className="divide-y divide-border">
              {rows.map((a) => (
                <li key={a.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", !a.isActive && "opacity-60")}>
                  <Link href={`/e/${entityId}/accounts/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-primary" style={{ paddingLeft: `${depth(a, byId) * 1.25}rem` }}>
                    {simple ? null : <span className="w-12 shrink-0 text-muted tabular">{a.code}</span>}
                    <span className={cn("truncate", !a.isLeaf && "font-medium")}>{a.name}</span>
                    {masked.get(a.id) ? <span className="text-xs text-muted tabular">{masked.get(a.id)}</span> : null}
                    {a.systemKey ? <Lock aria-label="System account" className="size-3.5 shrink-0 text-muted" /> : null}
                    {!a.isActive ? <Badge>Deactivated</Badge> : null}
                    {!simple ? <span className="ml-auto hidden text-xs text-muted sm:inline">{SUBTYPE_LABEL[a.subtype] ?? a.subtype}</span> : <span className="ml-auto" />}
                  </Link>
                  <Amount minor={a.balance} muteZero className="w-32 shrink-0" />
                  {canEdit ? <EditAccount account={a} /> : null}
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function AddAccount({ entityId, accounts, simple }: { entityId: string; accounts: Account[]; simple: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AccountType>("expense");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const parents = accounts.filter((a) => a.type === type && !a.hasPostings && !a.systemKey);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api.createAccount(entityId, {
        code: String(f.get("code") ?? "").trim(),
        name: String(f.get("name") ?? "").trim(),
        subtype: String(f.get("subtype")),
        parentId: String(f.get("parentId") ?? "") || null,
        description: String(f.get("description") ?? "").trim() || null,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "We couldn't add the account.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {simple ? "Add category" : "Add account"}
      </Button>
      <DialogContent className="max-w-xl">
        <DialogTitle>{simple ? "Add a category" : "Add an account"}</DialogTitle>
        <DialogDescription>Codes follow the ranges in your chart: 1000s assets, 2000s liabilities, 3000s equity, 4000s income, 5000–8999 expenses.</DialogDescription>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {error ? <Alert tone="danger" title={error} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="a-type" label="Kind">
              <Select id="a-type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                {GROUPS.map((g) => (
                  <option key={g.type} value={g.type}>
                    {simple ? g.simpleTitle : g.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="a-subtype" label="Presentation">
              <Select id="a-subtype" name="subtype" key={type}>
                {SUBTYPES_BY_TYPE[type].map((s) => (
                  <option key={s} value={s}>
                    {SUBTYPE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="a-code" label="Code">
              <Input id="a-code" name="code" inputMode="numeric" placeholder="6250" />
            </Field>
            <Field id="a-name" label="Name">
              <Input id="a-name" name="name" placeholder="Generator repairs" />
            </Field>
            <Field id="a-parent" label="Group under (optional)">
              <Select id="a-parent" name="parentId" key={`p-${type}`}>
                <option value="">None</option>
                {parents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="a-desc" label="Description (optional)">
              <Input id="a-desc" name="description" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditAccount({ account }: { account: Account }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(body: Parameters<typeof api.updateAccount>[1]) {
    setPending(true);
    setError(null);
    try {
      await api.updateAccount(account.id, body);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "We couldn't save the account.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Edit ${account.name}`}>
        Edit
      </Button>
      <DialogContent>
        <DialogTitle>Edit {account.name}</DialogTitle>
        <DialogDescription>{account.hasPostings ? "This account has postings: its history stays as it is." : "This account has no postings yet."}</DialogDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({ name: String(f.get("name") ?? "").trim(), code: String(f.get("code") ?? "").trim() });
          }}
          className="grid gap-4"
        >
          {error ? <Alert tone="danger" title={error} /> : null}
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field id="e-code" label="Code">
              <Input id="e-code" name="code" defaultValue={account.code} disabled={Boolean(account.systemKey)} />
            </Field>
            <Field id="e-name" label="Name">
              <Input id="e-name" name="name" defaultValue={account.name} />
            </Field>
          </div>
          <DialogFooter className="sm:justify-between">
            {account.systemKey ? (
              <span className="text-xs text-muted">System accounts can be renamed but not deactivated.</span>
            ) : (
              <Button variant="ghost" onClick={() => save({ isActive: !account.isActive })} disabled={pending}>
                {account.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
          {account.isActive && !account.systemKey ? (
            <p className="text-xs text-muted">Deactivating stops new postings. The account stays in past reports.</p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
