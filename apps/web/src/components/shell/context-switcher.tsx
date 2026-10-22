"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kedge/ui";
import { Building2, Check, ChevronsUpDown, Landmark, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { selectOrganisation } from "@/server/actions";
import type { ShellData } from "./types";

/** Org switcher and entity switcher in one control, so it fits at 360 px. */
export function ContextSwitcher({ me, org, entityId }: ShellData) {
  const router = useRouter();
  const entity = org.entities.find((e) => e.id === entityId) ?? null;
  const canCreate = org.orgPermissions.includes("entity.create");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 min-w-0 flex-1 shrink justify-start gap-2 px-2 sm:max-w-sm sm:flex-none" aria-label="Switch organisation or business">
          <span className="grid min-w-0 text-left leading-tight">
            <span className="truncate text-[11px] font-normal text-muted">{org.organisation.name}</span>
            <span className="truncate text-sm font-semibold">{entity ? (entity.tradingName ?? entity.legalName) : "All businesses"}</span>
          </span>
          <ChevronsUpDown aria-hidden className="ml-auto text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuLabel>Businesses in {org.organisation.name}</DropdownMenuLabel>
        {org.entities.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted">No businesses yet</p> : null}
        {org.entities.map((e) => (
          <DropdownMenuItem key={e.id} onSelect={() => router.push(`/e/${e.id}/dashboard`)}>
            <Landmark aria-hidden />
            <span className="truncate">{e.tradingName ?? e.legalName}</span>
            {e.id === entityId ? <Check aria-hidden className="ml-auto !text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => router.push("/")}>
          <Building2 aria-hidden />
          All businesses
        </DropdownMenuItem>
        {canCreate ? (
          <DropdownMenuItem asChild>
            <Link href="/?add=1">
              <Plus aria-hidden />
              Add a business
            </Link>
          </DropdownMenuItem>
        ) : null}
        {me.organisations.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Organisations</DropdownMenuLabel>
            {me.organisations.map((o) => (
              <DropdownMenuItem
                key={o.id}
                onSelect={async () => {
                  await selectOrganisation(o.id);
                  router.push("/");
                  router.refresh();
                }}
              >
                <Building2 aria-hidden />
                <span className="truncate">{o.name}</span>
                {o.id === org.organisation.id ? <Check aria-hidden className="ml-auto !text-primary" /> : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
