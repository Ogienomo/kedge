"use client";

import { Button, cn, Kbd, Logo } from "@kedge/ui";
import { ArrowLeftRight, BookOpen, Building2, CalendarRange, FileBarChart, History, LayoutDashboard, ListTree, Plus, Search, Settings, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CommandPalette } from "./command-palette";
import { ContextSwitcher } from "./context-switcher";
import { ModeToggle } from "./mode-toggle";
import { Notifications } from "./notifications";
import { QuickAdd } from "./quick-add";
import type { ShellData } from "./types";
import { useHotkey } from "./use-hotkey";
import { UserMenu } from "./user-menu";

export function AppShell({ data, children }: { data: ShellData; children: ReactNode }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  useHotkey("/", () => setSearchOpen(true));
  const entity = data.org.entities.find((e) => e.id === data.entityId) ?? null;
  const canRecord = entity?.permissions.includes("transaction.create") ?? false;
  useHotkey("n", () => setAddOpen(canRecord));

  const isFirm = data.org.organisation.kind === "firm";
  const simple = entity?.displayMode === "simple";
  const has = (p: string) => entity?.permissions.includes(p as never) ?? false;
  const base = entity ? `/e/${entity.id}` : "";
  const nav: { href: string; label: string; icon: typeof LayoutDashboard; group: "entity" | "org" }[] = [
    ...(entity
      ? [
          { href: `${base}/dashboard`, label: "Dashboard", icon: LayoutDashboard, group: "entity" as const },
          { href: `${base}/transactions`, label: simple ? "Money in & out" : "Transactions", icon: ArrowLeftRight, group: "entity" as const },
          { href: `${base}/contacts`, label: "Contacts", icon: Users, group: "entity" as const },
          { href: `${base}/accounts`, label: simple ? "Categories" : "Chart of accounts", icon: ListTree, group: "entity" as const },
          ...(!simple && has("report.view") ? [{ href: `${base}/journals`, label: "Journals", icon: BookOpen, group: "entity" as const }] : []),
          ...(!simple && has("report.view") ? [{ href: `${base}/periods`, label: "Periods", icon: CalendarRange, group: "entity" as const }] : []),
          ...(has("report.view") ? [{ href: `${base}/reports`, label: "Reports", icon: FileBarChart, group: "entity" as const }] : []),
          ...(has("audit_log.view") ? [{ href: `${base}/audit`, label: "Audit log", icon: History, group: "entity" as const }] : []),
        ]
      : []),
    { href: isFirm ? "/practice" : "/", label: isFirm ? "Clients" : "Businesses", icon: Building2, group: "org" },
    { href: "/org/settings", label: "Team", icon: Settings, group: "org" },
    { href: "/account", label: "Account", icon: User, group: "org" },
  ];
  const isCurrent = (href: string) => pathname === href || (href !== "/" && href.split("/").length > 3 && pathname.startsWith(`${href}/`));

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="flex h-14 items-center gap-1 px-2 sm:gap-2 sm:px-4">
          <Link href="/" className="shrink-0 rounded-md p-1" aria-label="Home">
            <Logo showName={false} className="sm:hidden" />
            <Logo className="hidden sm:inline-flex" />
          </Link>
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <ContextSwitcher {...data} />
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <Button variant="secondary" size="sm" className="hidden w-48 justify-start text-muted md:inline-flex" onClick={() => setSearchOpen(true)}>
              <Search aria-hidden />
              Search…
              <Kbd className="ml-auto">/</Kbd>
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setSearchOpen(true)}>
              <Search aria-hidden />
            </Button>
            {entity ? <ModeToggle entity={entity} className="hidden lg:inline-flex" /> : null}
            {canRecord ? (
              <Button size="sm" onClick={() => setAddOpen(true)} aria-keyshortcuts="N" className="max-sm:size-9 max-sm:px-0">
                <Plus aria-hidden />
                <span className="max-sm:sr-only">New</span>
              </Button>
            ) : null}
            <Notifications />
            <UserMenu
              me={data.me}
              extra={
                entity ? (
                  <div className="px-2 pt-1 pb-2 lg:hidden">
                    <p className="mb-1.5 text-xs font-medium text-muted">Display mode</p>
                    <ModeToggle entity={entity} />
                  </div>
                ) : null
              }
            />
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 sm:px-4 lg:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-subtle aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground [&_svg]:size-4"
            >
              <item.icon aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex flex-1">
        <nav aria-label="Main" className="hidden w-56 shrink-0 border-r border-border bg-surface px-3 py-4 lg:block">
          <ul className="grid gap-0.5">
            {nav.map((item, i) => (
              <li key={item.href} className={cn(i > 0 && item.group !== nav[i - 1]?.group && "mt-3 border-t border-border pt-3")}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted hover:bg-subtle hover:text-foreground [&_svg]:size-4",
                    "aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-accent-foreground",
                  )}
                >
                  <item.icon aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <CommandPalette org={data.org} open={searchOpen} onOpenChange={setSearchOpen} />
      {entity ? <QuickAdd entity={entity} open={addOpen} onOpenChange={setAddOpen} /> : null}
    </div>
  );
}
