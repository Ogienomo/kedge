import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityDetail, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { listAccounts } from "@/server/services/ledger/accounts";
import { JournalEditor } from "../journal-editor";

export const metadata: Metadata = { title: "New journal" };

export default async function NewJournalPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity || !entity.permissions.includes("journal.manual.post")) notFound();
  const [detail, { accounts }] = await Promise.all([loadEntityDetail(entityId), listAccounts(await loadContext(), entityId)]);
  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <PageHeader title="New journal" description="Drafts can be unbalanced and edited freely. Posting requires debits to equal credits." />
      <JournalEditor entityId={entityId} accounts={accounts} today={detail.today} />
    </div>
  );
}
