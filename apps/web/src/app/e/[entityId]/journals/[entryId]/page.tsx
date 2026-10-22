import { NotFoundError } from "@kedge/core";
import { Badge, Card, CardContent } from "@kedge/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate } from "@/components/ledger/amount";
import { JournalLinesTable } from "@/components/ledger/journal-lines-table";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityDetail, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { listAccounts } from "@/server/services/ledger/accounts";
import { getJournal } from "@/server/services/ledger/journals";
import { JournalEditor } from "../journal-editor";
import { SOURCE_LABEL } from "../journals-view";
import { JournalActions } from "./journal-actions";

export const metadata: Metadata = { title: "Journal" };

export default async function JournalPage({ params }: { params: Promise<{ entityId: string; entryId: string }> }) {
  const { entityId, entryId } = await params;
  const ctx = await loadContext();
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  const j = await getJournal(ctx, entryId).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const can = (p: string) => entity.permissions.includes(p as never);
  const editable = j.status === "draft" && j.sourceType === "manual" && can("journal.manual.post");

  if (editable) {
    const [detail, { accounts }] = await Promise.all([loadEntityDetail(entityId), listAccounts(ctx, entityId)]);
    return (
      <div className="mx-auto grid max-w-5xl gap-4">
        <Link href={`/e/${entityId}/journals`} className="w-fit text-sm text-primary hover:underline">
          ← Journals
        </Link>
        <PageHeader title="Draft journal" description="Not yet posted: it does not affect reports." actions={<JournalActions journal={j} entityId={entityId} canReverse={false} canDelete />} />
        <JournalEditor entityId={entityId} accounts={accounts} today={detail.today} draft={j} />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Link href={`/e/${entityId}/journals`} className="w-fit text-sm text-primary hover:underline">
        ← Journals
      </Link>
      <PageHeader
        title={j.number ?? "Draft"}
        description={`${formatDate(j.entryDate)} · ${SOURCE_LABEL[j.sourceType] ?? j.sourceType}`}
        actions={<JournalActions journal={j} entityId={entityId} canReverse={can("journal.reverse") && j.status === "posted" && !j.reversedByEntryId && j.sourceType !== "reversal"} canDelete={false} />}
      />
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {j.reversedByEntryId ? <Badge>Reversed</Badge> : j.status === "posted" ? <Badge tone="success">Posted</Badge> : <Badge tone="warning">Draft</Badge>}
            {j.memo ? <span>{j.memo}</span> : null}
          </div>
          <JournalLinesTable lines={j.lines} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-border pt-4 text-sm">
            {j.postedBy ? (
              <>
                <dt className="text-muted">Posted by</dt>
                <dd>
                  {j.postedBy}
                  {j.postedAt ? ` · ${new Date(j.postedAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}` : ""}
                </dd>
              </>
            ) : null}
            {j.reversesEntryId ? (
              <>
                <dt className="text-muted">Reverses</dt>
                <dd>
                  <Link href={`/e/${entityId}/journals/${j.reversesEntryId}`} className="text-primary hover:underline">
                    Original entry
                  </Link>
                  {j.reversalReason ? ` · ${j.reversalReason}` : ""}
                </dd>
              </>
            ) : null}
            {j.reversedByEntryId ? (
              <>
                <dt className="text-muted">Reversed by</dt>
                <dd>
                  <Link href={`/e/${entityId}/journals/${j.reversedByEntryId}`} className="text-primary hover:underline">
                    Reversal entry
                  </Link>
                </dd>
              </>
            ) : null}
            {j.sourceType === "transaction" && j.sourceId ? (
              <>
                <dt className="text-muted">Source</dt>
                <dd>
                  <Link href={`/e/${entityId}/transactions/${j.sourceId}`} className="text-primary hover:underline">
                    Transaction
                  </Link>
                </dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
