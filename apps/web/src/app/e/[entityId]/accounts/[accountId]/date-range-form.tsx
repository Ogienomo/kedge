"use client";

import { Input } from "@kedge/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Date range filter kept in the URL so views can be shared and bookmarked. */
export function DateRangeForm({ from, to, max }: { from: string; to: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (k: "from" | "to", v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs text-muted">
        From
        <Input type="date" value={from} max={to} onChange={(e) => set("from", e.target.value)} className="h-9 w-40" />
      </label>
      <label className="grid gap-1 text-xs text-muted">
        To
        <Input type="date" value={to} min={from} max={max} onChange={(e) => set("to", e.target.value)} className="h-9 w-40" />
      </label>
    </div>
  );
}
