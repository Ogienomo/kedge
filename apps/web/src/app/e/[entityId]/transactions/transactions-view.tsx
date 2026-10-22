"use client";

import type { Transaction } from "@kedge/api";
import { Badge, Button, EmptyState, Input, Select } from "@kedge/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Amount, formatDate } from "@/components/ledger/amount";

export const KIND_LABELS: Record<Transaction["kind"], string> = {
  money_in: "Money in",
  money_out: "Money out",
  transfer: "Transfer",
  owner_in: "Owner put in",
  owner_out: "Owner took out",
  loan_in: "Loan received",
  loan_repay: "Loan repayment",
};

const INBOUND = new Set(["money_in", "owner_in", "loan_in"]);

export const STATUS_TONE = { draft: "warning", posted: "success", reversed: "neutral" } as const;

const columns: ColumnDef<Transaction, unknown>[] = [
  { accessorKey: "txnDate", header: "Date", cell: (c) => <span className="whitespace-nowrap">{formatDate(c.row.original.txnDate)}</span> },
  {
    id: "what",
    header: "Description",
    accessorFn: (r) => r.contactName ?? r.counterAccountName,
    cell: (c) => {
      const t = c.row.original;
      return (
        <span className="grid">
          <span className="font-medium">{t.contactName ?? t.counterAccountName}</span>
          <span className="text-xs text-muted">
            {KIND_LABELS[t.kind]} · {t.counterAccountName}
            {t.reference ? ` · ${t.reference}` : ""}
          </span>
        </span>
      );
    },
  },
  { accessorKey: "bankAccountName", header: "Account", cell: (c) => <span className="text-muted">{c.row.original.bankAccountName}</span> },
  { accessorKey: "status", header: "Status", cell: (c) => <Badge tone={STATUS_TONE[c.row.original.status]}>{c.row.original.status}</Badge> },
  {
    id: "amount",
    header: "Amount",
    meta: { align: "right" },
    accessorFn: (r) => Number(BigInt(r.breakdown.bank) / 100n),
    cell: (c) => {
      const t = c.row.original;
      const v = BigInt(t.breakdown.bank);
      return <Amount minor={INBOUND.has(t.kind) ? v : t.kind === "transfer" ? v : -v} negative="minus" className={INBOUND.has(t.kind) ? "text-success" : undefined} />;
    },
  },
];

export function TransactionsView({
  entityId,
  simple,
  filters,
  page,
  canRecord,
}: {
  entityId: string;
  simple: boolean;
  filters: { from?: string | undefined; to?: string | undefined; kind?: string | undefined; status?: string | undefined; cursor?: string | undefined };
  page: { transactions: Transaction[]; nextCursor: string | null };
  canRecord: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(Object.entries({ ...filters, cursor: undefined, [k]: v || undefined }).filter((e): e is [string, string] => Boolean(e[1])));
    router.push(`${pathname}?${next.toString()}`);
  };
  const filtered = Boolean(filters.from || filters.to || filters.kind || filters.status);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted">
          From
          <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilter("from", e.target.value)} className="h-9 w-40" />
        </label>
        <label className="grid gap-1 text-xs text-muted">
          To
          <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilter("to", e.target.value)} className="h-9 w-40" />
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Type
          <Select value={filters.kind ?? ""} onChange={(e) => setFilter("kind", e.target.value)} className="h-9 w-44">
            <option value="">All</option>
            {Object.entries(KIND_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Status
          <Select value={filters.status ?? ""} onChange={(e) => setFilter("status", e.target.value)} className="h-9 w-36">
            <option value="">All</option>
            <option value="posted">Posted</option>
            <option value="draft">Draft</option>
            <option value="reversed">Reversed</option>
          </Select>
        </label>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
            Clear filters
          </Button>
        ) : null}
      </div>
      <DataTable
        caption="Transactions"
        data={page.transactions}
        columns={columns}
        rowHref={(t) => `/e/${entityId}/transactions/${t.id}`}
        empty={
          <EmptyState
            icon={<ArrowLeftRight />}
            title={filtered ? "Nothing matches these filters" : "Nothing recorded yet"}
            description={filtered ? "Try a wider date range." : canRecord ? `Press N or use “New” to record ${simple ? "money in or money out" : "your first transaction"}.` : undefined}
          />
        }
      />
      <div className="flex justify-between">
        {filters.cursor ? (
          <Button variant="secondary" size="sm" onClick={() => setFilter("cursor", String(Math.max(0, Number(filters.cursor) - 50)))}>
            Newer
          </Button>
        ) : (
          <span />
        )}
        {page.nextCursor ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={`${pathname}?${new URLSearchParams(Object.entries({ ...filters, cursor: page.nextCursor }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`}>Older</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
