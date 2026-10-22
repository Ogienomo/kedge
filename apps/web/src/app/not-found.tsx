import { Button, Logo } from "@kedge/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-4">
      <Logo />
      <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find that page</h1>
      <p className="text-sm text-muted">It may have moved, or you may not have access to it.</p>
      <Button asChild>
        <Link href="/">Go to your businesses</Link>
      </Button>
    </main>
  );
}
