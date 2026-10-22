"use client";

import { ApiRequestError } from "@kedge/api";
import { Alert, Button } from "@kedge/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { selectOrganisation } from "@/server/actions";

export function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid gap-3">
      {error ? <Alert tone="danger" title={error} /> : null}
      <Button
        size="lg"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const res = await api.acceptInvitation(token);
            await selectOrganisation(res.orgId);
            router.replace(res.entityId ? `/e/${res.entityId}/dashboard` : "/");
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "We couldn't accept the invitation. Please try again.");
            setPending(false);
          }
        }}
      >
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </div>
  );
}
