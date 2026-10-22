"use client";

import type { AuditEntry } from "@kedge/api";
import { Button, EmptyState, Input, Select } from "@kedge/ui";
import { History } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/** Action prefixes offered as filters; the API matches by prefix. */
const AREAS: Record<string, string> = {
  journal: "Journals",
  transaction: "Transactions",
  period: "Periods",
  fiscal_year: "Financial years",
  account: "Accounts",
  bank_account: "Bank accounts",
  contact: "Contacts",
  tax_code: "Tax codes",
  entity: "Business settings",
  entity_access: "Access",
};

const LABELS: Record<string, string> = {
  "entity.create": "Business created",
  "entity.setup": "Books set up",
  "account.create": "Account added",
  "account.update": "Account changed",
  "account.deactivate": "Account deactivated",
  "bank_account.create": "Bank account added",
  "contact.create": "Contact added",
  "contact.update": "Contact changed",
  "fiscal_year.create": "Financial year added",
  "journal.draft.create": "Draft journal created",
  "journal.draft.update": "Draft journal changed",
  "journal.draft.delete": "Draft journal deleted",
  "journal.post": "Journal posted",
  "journal.reverse": "Journal reversed",
  "period.lock": "Period locked",
  "period.unlock": "Period unlocked",
  "tax_code.create": "Tax code added",
  "transaction.create": "Transaction recorded",
  "transaction.post": "Transaction posted",
  "transaction.reverse": "Transaction reversed",
  "entity_access.create": "Access granted",
};

const time = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

type Change = { key: string; before: string | undefined; after: string | undefined };

const show = (v: unknown): string | undefined => (v === undefined ? undefined : v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : v === null || v === undefined ? {} : { value: v });

/** Field-level diff of the before/after snapshots; unchanged fields are omitted. */
export function diff(before: unknown, after: unknown): Change[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  return keys
    .map((key) => ({ key, before: show(b[key]), after: show(a[key]) }))
    .filter((c) => c.before !== c.after);
}

function Entry({ e }: { e: AuditEntry }) {
  const changes = diff(e.before, e.after);
  return (
    <li className="rounded-lg border border-border bg-surface">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span className="grid min-w-0">
            <span className="font-medium">{LABELS[e.action] ?? e.action}</span>
            <span className="truncate text-xs text-muted">
              {e.actorName ?? "System"}
              {e.reason ? ` · “${e.reason}”` : ""}
            </span>
          </span>
          <time dateTime={e.at} className="text-xs whitespace-nowrap text-muted tabular-nums">
            {time.format(new Date(e.at))}
          </time>
        </summary>
        <div className="grid gap-2 border-t border-border px-4 py-3 text-sm">
          <p className="text-xs text-muted">
            <span className="font-mono">{e.action}</span> on {e.targetType}
            {e.targetId ? <span className="font-mono"> {e.targetId}</span> : null}
          </p>
          {changes.length === 0 ? (
            <p className="text-muted">No field changes recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Changes</caption>
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-medium">Field</th>
                    <th scope="col" className="py-1 pr-3 font-medium">Before</th>
                    <th scope="col" className="py-1 font-medium">After</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.key} className="border-t border-border align-top">
                      <th scope="row" className="py-1 pr-3 font-mono font-normal">{c.key}</th>
                      <td className="max-w-64 py-1 pr-3 break-words text-danger">{c.before ?? <span className="text-muted">—</span>}</td>
                      <td className="max-w-64 py-1 break-words text-success">{c.after ?? <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

export function AuditView({
  filters,
  page,
}: {
  filters: { from?: string | undefined; to?: string | undefined; action?: string | undefined; cursor?: string | undefined };
  page: { entries: AuditEntry[]; nextCursor: string | null };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const href = (next: Record<string, string | undefined>) => `${pathname}?${new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`;
  const setFilter = (k: string, v: string) => router.push(href({ ...filters, cursor: undefined, [k]: v || undefined }));
  const filtered = Boolean(filters.from || filters.to || filters.action);

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
          Area
          <Select value={filters.action ?? ""} onChange={(e) => setFilter("action", e.target.value)} className="h-9 w-44">
            <option value="">All</option>
            {Object.entries(AREAS).map(([k, l]) => (
              <option key={k} value={`${k}.`}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
            Clear filters
          </Button>
        ) : null}
      </div>
      {page.entries.length === 0 ? (
        <EmptyState icon={<History />} title={filtered ? "Nothing matches these filters" : "No activity yet"} description={filtered ? "Try a wider date range." : undefined} />
      ) : (
        <ul className="grid gap-2">
          {page.entries.map((e) => (
            <Entry key={e.id} e={e} />
          ))}
        </ul>
      )}
      <div className="flex justify-between">
        {filters.cursor ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={href({ ...filters, cursor: String(Math.max(0, Number(filters.cursor) - 50)) })}>Newer</Link>
          </Button>
        ) : (
          <span />
        )}
        {page.nextCursor ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={href({ ...filters, cursor: page.nextCursor })}>Older</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
