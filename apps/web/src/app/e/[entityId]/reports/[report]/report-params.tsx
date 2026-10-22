"use client";

import { Button, Input, Select } from "@kedge/ui";
import { Download } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function ReportParams({
  kind,
  values,
  allowCompare,
  exportBase,
  today,
}: {
  kind: "asOf" | "range";
  values: { from?: string; to?: string; asOf?: string; compare: string; includeZero: boolean };
  allowCompare: boolean;
  exportBase: string | null;
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${pathname}?${next.toString()}`);
  };
  const exportHref = (format: string) => `${exportBase}&${new URLSearchParams({ ...Object.fromEntries(params), format }).toString()}`;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3 print:hidden">
      {kind === "asOf" ? (
        <label className="grid gap-1 text-xs text-muted">
          As at
          <Input type="date" value={values.asOf ?? ""} max={today} onChange={(e) => set("asOf", e.target.value)} className="h-9 w-40" />
        </label>
      ) : (
        <>
          <label className="grid gap-1 text-xs text-muted">
            From
            <Input type="date" value={values.from ?? ""} onChange={(e) => set("from", e.target.value)} className="h-9 w-40" />
          </label>
          <label className="grid gap-1 text-xs text-muted">
            To
            <Input type="date" value={values.to ?? ""} onChange={(e) => set("to", e.target.value)} className="h-9 w-40" />
          </label>
        </>
      )}
      {allowCompare ? (
        <label className="grid gap-1 text-xs text-muted">
          Compare with
          <Select value={values.compare} onChange={(e) => set("compare", e.target.value === "none" ? null : e.target.value)} className="h-9 w-48">
            <option value="none">No comparison</option>
            <option value="previous_period">{kind === "asOf" ? "Start of the year" : "Previous period"}</option>
            <option value="previous_year">Same time last year</option>
          </Select>
        </label>
      ) : null}
      <label className="inline-flex h-9 items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={values.includeZero} onChange={(e) => set("includeZero", e.target.checked ? "true" : null)} className="size-4 accent-[var(--color-primary)]" />
        Show zero lines
      </label>
      {exportBase ? (
        <div className="ml-auto flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href={exportHref("xlsx")} download>
              <Download aria-hidden />
              Excel
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href={exportHref("csv")} download>
              CSV
            </a>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      ) : null}
    </div>
  );
}
