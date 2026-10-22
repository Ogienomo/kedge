"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kedge/ui";
import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTheme, type ThemePreference } from "../theme";
import type { ShellData } from "./types";

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function UserMenu({ me, extra }: Pick<ShellData, "me"> & { extra?: ReactNode }) {
  const [theme, setTheme] = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid size-9 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground hover:ring-2 hover:ring-border-strong"
        aria-label="Your account"
      >
        {initials(me.user.fullName, me.user.email)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="grid px-2 py-1.5">
          <span className="truncate text-sm font-medium">{me.user.fullName ?? me.user.email}</span>
          <span className="truncate text-xs text-muted">{me.user.email}</span>
        </div>
        {extra}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <User aria-hidden />
            My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/org/settings">
            <Settings aria-hidden />
            Team and organisation
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">Match my device</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <form action="/auth/signout" method="post">
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden />
              Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
