"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@kedge/ui";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, MoreHorizontal } from "lucide-react";

const OPTIONS = [
  { label: "Money in", icon: ArrowDownLeft },
  { label: "Money out", icon: ArrowUpRight },
  { label: "Transfer", icon: ArrowLeftRight },
  { label: "Other", icon: MoreHorizontal },
];

/**
 * Quick add (`N`). The shell is part of Phase 0; recording transactions
 * arrives with the ledger in Phase 1, so the options are shown but disabled.
 */
export function QuickAdd({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Record something</DialogTitle>
        <DialogDescription>Recording transactions opens once this business&apos;s books are set up.</DialogDescription>
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              disabled
              className="flex flex-col items-start gap-2 rounded-lg border border-border p-3 text-left text-sm font-medium opacity-60"
            >
              <o.icon aria-hidden className="size-5 text-muted" />
              {o.label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
