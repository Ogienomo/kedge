"use client";

import { ApiRequestError, type Transaction } from "@kedge/api";
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@kedge/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, formatNaira } from "@/components/ledger/amount";
import { ReverseDialog } from "@/components/ledger/reverse-dialog";
import { useIdempotencyKey } from "@/components/ledger/use-idempotency-key";
import { api } from "@/lib/api";

export function TransactionActions({ transaction: t, canPost, canReverse, journalNumber }: { transaction: Transaction; canPost: boolean; canReverse: boolean; journalNumber: string | null }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [key, renewKey] = useIdempotencyKey();

  if (t.status === "draft" && canPost) {
    return (
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <Button onClick={() => setConfirm(true)}>Post</Button>
        <DialogContent>
          <DialogTitle>Post this transaction?</DialogTitle>
          <DialogDescription>
            {formatNaira(t.breakdown.bank)} will be recorded on {formatDate(t.txnDate)}. Once posted it can no longer be edited, only reversed.
          </DialogDescription>
          {error ? <Alert tone="danger" title={error} /> : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Not yet
            </Button>
            <Button
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setError(null);
                try {
                  await api.postTransaction(t.id, key);
                  renewKey();
                  setConfirm(false);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof ApiRequestError ? err.message : "We couldn't post it. Please try again.");
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? "Posting…" : "Post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (t.status === "posted" && canReverse) {
    return (
      <ReverseDialog
        what="transaction"
        description={
          <>
            <p>
              A reversing entry{journalNumber ? ` for ${journalNumber}` : ""} will undo its effect on every account. The original stays in the books, marked as reversed, so the audit trail is
              complete.
            </p>
            <p>To correct it, record the transaction again with the right details afterwards.</p>
          </>
        }
        onReverse={async (reason, idem) => {
          await api.reverseTransaction(t.id, { reason }, idem);
        }}
      />
    );
  }
  return null;
}
