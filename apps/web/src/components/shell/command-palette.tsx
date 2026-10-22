"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle, Kbd } from "@kedge/ui";
import { Landmark, Search, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { ShellData } from "./types";

interface Command {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: ReactNode;
}

/** Global search (`/`). In Phase 0 it finds businesses and pages; ledger search arrives with the ledger. */
export function CommandPalette({ org, open, onOpenChange }: Pick<ShellData, "org"> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const all: Command[] = [
      ...org.entities.map((e) => ({ id: e.id, label: e.tradingName ?? e.legalName, hint: "Business", href: `/e/${e.id}/dashboard`, icon: <Landmark aria-hidden /> })),
      { id: "org", label: "Team and organisation settings", hint: "Page", href: "/org/settings", icon: <Settings aria-hidden /> },
      { id: "account", label: "My account", hint: "Page", href: "/account", icon: <User aria-hidden /> },
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((c) => c.label.toLowerCase().includes(q)) : all;
  }, [org.entities, query]);

  function go(c: Command | undefined) {
    if (!c) return;
    onOpenChange(false);
    setQuery("");
    router.push(c.href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[15vh] max-w-xl translate-y-0 gap-0 p-0 sm:p-0"
        onOpenAutoFocus={(e) => {
          // Focus the search box explicitly (not the first focusable), and again
          // on the next frame in case a closing menu hands focus back to its trigger.
          e.preventDefault();
          inputRef.current?.focus();
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Find a business or page. Use the arrow keys to move and Enter to open.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search aria-hidden className="size-4 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, commands.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(commands[active]);
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={commands[active] ? `cmd-${commands[active].id}` : undefined}
            placeholder="Search businesses and pages…"
            className="h-12 flex-1 bg-transparent pr-8 text-sm outline-none placeholder:text-muted"
          />
        </div>
        <ul id="command-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {commands.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{query}”.</li> : null}
          {commands.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(c)}
              className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-subtle [&_svg]:size-4 [&_svg]:text-muted"
            >
              {c.icon}
              <span className="flex-1 truncate">{c.label}</span>
              <span className="text-xs text-muted">{c.hint}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> to open
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> to close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
