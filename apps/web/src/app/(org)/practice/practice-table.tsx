"use client";

import type { PracticeClient } from "@kedge/api";
import { Badge, Select } from "@kedge/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Amount, formatDate } from "@/components/ledger/amount";

const columns: ColumnDef<PracticeClient, unknown>[] = [
  { accessorKey: "name", header: "Client", cell: (c) => <span className="font-medium">{c.row.original.name}</span> },
  {
    id: "staff",
    header: "Assigned staff",
    enableSorting: false,
    cell: (c) => <span className="text-muted">{c.row.original.assignedStaff.map((s) => s.name).join(", ") || "—"}</span>,
  },
  {
    id: "status",
    header: "Books",
    accessorFn: (r) => (r.booksReady ? 1 : 0),
    cell: (c) => (c.row.original.booksReady ? <Badge tone="success">Ready</Badge> : <Badge tone="warning">Not set up</Badge>),
  },
  {
    id: "suspense",
    header: "Suspense",
    meta: { align: "right" },
    accessorFn: (r) => Number(BigInt(r.suspenseBalance) !== 0n),
    cell: (c) => <Amount minor={c.row.original.suspenseBalance} muteZero />,
  },
  { accessorKey: "draftCount", header: "Drafts", meta: { align: "right" }, cell: (c) => <span className="tabular">{c.row.original.draftCount}</span> },
  {
    accessorKey: "latestLockedPeriodEnd",
    header: "Locked to",
    cell: (c) => <span className="text-muted">{c.row.original.latestLockedPeriodEnd ? formatDate(c.row.original.latestLockedPeriodEnd) : "—"}</span>,
  },
];

export function PracticeTable({ clients }: { clients: PracticeClient[] }) {
  const staff = useMemo(() => [...new Map(clients.flatMap((c) => c.assignedStaff).map((s) => [s.userId, s.name])).entries()], [clients]);
  const [assignee, setAssignee] = useState("");
  const rows = assignee ? clients.filter((c) => c.assignedStaff.some((s) => s.userId === assignee)) : clients;
  return (
    <div className="grid gap-3">
      {staff.length > 0 ? (
        <div className="flex items-center gap-2">
          <label htmlFor="assignee" className="text-sm text-muted">
            Assigned to
          </label>
          <Select id="assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 w-56">
            <option value="">Anyone</option>
            {staff.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <DataTable caption="Client businesses" data={rows} columns={columns} rowHref={(r) => `/e/${r.entityId}/dashboard`} />
    </div>
  );
}
