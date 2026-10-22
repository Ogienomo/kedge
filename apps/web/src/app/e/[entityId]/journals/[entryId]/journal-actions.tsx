"use client";

import { ApiRequestError, type JournalDetail } from "@kedge/api";
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@kedge/ui";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/components/ledger/amount";
import { ReverseDialog } from "@/components/ledger/reverse-dialog";
import { api } from "@/lib/api";

export function JournalActions({ journal: j, entityId, canReverse, canDelete }: { journal: JournalDetail; entityId: string; canReverse: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (canDelete) {
    return (
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
          <Trash2 aria-hidden />
          Delete draft
        </Button>
        <DialogContent>
          <DialogTitle>Delete this draft?</DialogTitle>
          <DialogDescription>The draft and its lines will be removed. Drafts never affected your reports, so nothing else changes.</DialogDescription>
          {error ? <Alert tone="danger" title={error} /> : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep draft
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await api.deleteJournalDraft(j.id);
                  router.push(`/e/${entityId}/journals`);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof ApiRequestError ? err.message : "We couldn't delete the draft.");
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (canReverse) {
    return (
      <ReverseDialog
        what="entry"
        description={
          <>
            <p>
              A new entry will be posted with every debit and credit of {j.number} swapped, cancelling its effect on all accounts. It is dated {formatDate(j.entryDate)}, or the first open date
              after it if that period is locked.
            </p>
            <p>{j.number} stays in the ledger, linked to its reversal.</p>
          </>
        }
        onReverse={async (reason, key) => {
          const reversal = await api.reverseJournal(j.id, { reason }, key);
          return { redirect: `/e/${entityId}/journals/${reversal.id}` };
        }}
        redirectTo={(r) => r?.redirect}
      />
    );
  }
  return null;
}
