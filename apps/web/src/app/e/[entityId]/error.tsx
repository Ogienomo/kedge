"use client";

import { Alert, Button } from "@kedge/ui";

/** Errors inside the shell keep the navigation, so the user can move on. */
export default function ShellError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto grid max-w-md gap-4 py-12">
      <Alert tone="danger" title="Something went wrong">
        We couldn&apos;t load this page. Your data is safe. Please try again.
      </Alert>
      <Button onClick={reset} className="w-fit">
        Try again
      </Button>
    </div>
  );
}
