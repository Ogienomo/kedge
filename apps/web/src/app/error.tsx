"use client";

import { Alert, Button } from "@kedge/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-4 px-4">
      <Alert tone="danger" title="Something went wrong">
        We couldn&apos;t load this page. Your data is safe. Please try again.
      </Alert>
      <Button onClick={reset} className="w-fit">
        Try again
      </Button>
    </main>
  );
}
