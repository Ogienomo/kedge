"use client";

import { Button } from "@kedge/ui";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function ResendButton({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  return (
    <div className="grid gap-2">
      <Button
        variant="secondary"
        disabled={state === "sending" || state === "sent"}
        onClick={async () => {
          setState("sending");
          const { error } = await supabaseBrowser().auth.resend({ type: "signup", email });
          setState(error ? "error" : "sent");
        }}
      >
        {state === "sent" ? "Email sent" : state === "sending" ? "Sending…" : "Resend the email"}
      </Button>
      <p role="status" className="text-xs text-muted">
        {state === "sent" ? "A new link is on its way. Check your spam folder too." : state === "error" ? "We couldn't resend it just now. Try again in a minute." : ""}
      </p>
    </div>
  );
}
