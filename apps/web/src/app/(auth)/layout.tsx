import { APP_NAME } from "@kedge/config";
import { Logo } from "@kedge/ui";
import { Anchor } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-md text-lg font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary-foreground/15">
            <Anchor aria-hidden className="size-4" />
          </span>
          {APP_NAME}
        </Link>
        <div className="grid max-w-md gap-4">
          <p className="text-3xl leading-tight font-semibold tracking-tight">Books you can trust, without the jargon.</p>
          <p className="text-primary-foreground/80">
            Double-entry accounting built for Nigerian businesses, and for the accounting firms that keep their books.
          </p>
        </div>
        <ul className="grid gap-2 text-sm text-primary-foreground/80">
          <li>• Every entry balanced and audited</li>
          <li>• Naira-first, VAT and WHT aware</li>
          <li>• One login for every client you manage</li>
        </ul>
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full border-[48px] border-primary-foreground/5" />
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <div className="lg:hidden">
          <Link href="/" className="inline-flex rounded-md">
            <Logo />
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
