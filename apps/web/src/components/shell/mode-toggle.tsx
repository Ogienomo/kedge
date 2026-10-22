"use client";

import type { EntitySummary } from "@kedge/api";
import { cn } from "@kedge/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";

const MODES = [
  { value: "simple", label: "Simple" },
  { value: "accountant", label: "Accountant" },
] as const;

/** Per-entity display mode (SPEC §3.4). Changes presentation only, never permissions. */
export function ModeToggle({ entity, className }: { entity: EntitySummary; className?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState(entity.displayMode);
  const [pending, startTransition] = useTransition();

  return (
    <div role="radiogroup" aria-label="Display mode" className={cn("inline-flex rounded-lg border border-border bg-subtle p-0.5", className)}>
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={mode === m.value}
          disabled={pending}
          onClick={() => {
            if (mode === m.value) return;
            const previous = mode;
            setMode(m.value);
            startTransition(async () => {
              try {
                await api.updateEntityPreferences(entity.id, { displayMode: m.value });
                router.refresh();
              } catch {
                setMode(previous);
              }
            });
          }}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            mode === m.value ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
