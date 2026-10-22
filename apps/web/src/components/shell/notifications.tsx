"use client";

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@kedge/ui";
import { Bell, BellOff } from "lucide-react";

/** Notifications inbox. Budget alerts and import results start arriving in Phase 2. */
export function Notifications() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <BellOff aria-hidden className="size-5 text-muted" />
          <p className="text-sm font-medium">You&apos;re all caught up</p>
          <p className="text-xs text-muted">We&apos;ll let you know when something needs your attention.</p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
