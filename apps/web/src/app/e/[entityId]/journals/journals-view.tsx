"use client";

import type { JournalSummary } from "@kedge/api";
import { Badge, Button, EmptyState, Select } from "@kedge/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Amount, formatDate } from "@/components/ledger/amount";

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  transaction: "Transaction",
  opening_balance: "Opening balance",
  reversal: "Reversal",
  year_end_close: "Year-end close",
  statement_import: "Bank import",
  invoice: "Invoice",
  bill: "Bill",
  payment: "Payment",
  fx_revaluation: "FX revaluation",
};

const columns: ColumnDef<JournalSummary, unknown>[] = [
  { accessorKey: "number", header: "Number", cell: (c) => <span className="tabular">{c.row.original.number ?? <span className="text-muted italic">draft</span>}</span> },
  { accessorKey: "entryDate", header: "Date", cell: (c) => <span className="whitespace-nowrap">{formatDate(c.row.original.entryDate)}</span> },
  { accessorKey: "memo", header: "Memo", cell: (c) => <span className="line-clamp-1">{c.row.original.memo || "—"}</span> },
  { accessorKey: "sourceType", header: "Source", cell: (c) => <span className="text-muted">{SOURCE_LABEL[c.row.original.sourceType] ?? c.row.original.sourceType}</span> },
  {
    id: "status",
    header: "Status",
    accessorFn: (r) => (r.reversedByEntryId ? "reversed" : r.status),
    cell: (c) => {
      const r = c.row.original;
      return r.reversedByEntryId ? <Badge>Reversed</Badge> : r.status === "draft" ? <Badge tone="warning">Draft</Badge> : <Badge tone="success">Posted</Badge>;
    },
  },
  { id: "total", header: "Amount", meta: { align: "right" }, accessorFn: (r) => Number(BigInt(r.total) / 100n), cell: (c) => <Amount minor={c.row.original.total} /> },
];

export function JournalsView({ entityId, filters, page }: { entityId: string; filters: { status?: string | undefined; sourceType?: string | undefined; cursor?: string | undefined }; page: { journals: JournalSummary[]; nextCursor: string | null } }) {
  const router = useRouter();
  const pathname = usePathname();
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...filters, ...next }).filter((e): e is [string, string] => Boolean(e[1])));
    return `${pathname}?${p.toString()}`;
  };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted">
          Status
          <Select value={filters.status ?? ""} onChange={(e) => router.push(href({ status: e.target.value || undefined, cursor: undefined }))} className="h-9 w-36">
            <option value="">All</option>
            <option value="posted">Posted</option>
            <option value="draft">Drafts</option>
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Source
          <Select value={filters.sourceType ?? ""} onChange={(e) => router.push(href({ sourceType: e.target.value || undefined, cursor: undefined }))} className="h-9 w-44">
            <option value="">All</option>
            {["manual", "transaction", "opening_balance", "reversal"].map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <DataTable
        caption="Journal entries"
        data={page.journals}
        columns={columns}
        rowHref={(j) => `/e/${entityId}/journals/${j.id}`}
        empty={<EmptyState icon={<BookOpen />} title="No entries" description="Entries appear here as transactions are recorded and journals posted." />}
      />
      {page.nextCursor ? (
        <Button asChild variant="secondary" size="sm" className="w-fit justify-self-end">
          <Link href={href({ cursor: page.nextCursor })}>Older</Link>
        </Button>
      ) : null}
    </div>
  );
}
