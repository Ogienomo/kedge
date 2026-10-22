import { Button } from "@kedge/ui";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { listJournals } from "@/server/services/ledger/journals";
import { JournalsView } from "./journals-view";

export const metadata: Metadata = { title: "Journals" };

export default async function JournalsPage({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { entityId } = await params;
  const sp = await searchParams;
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity || !entity.permissions.includes("report.view")) notFound();
  const filters = {
    status: sp.status === "draft" || sp.status === "posted" ? sp.status : undefined,
    sourceType: sp.sourceType && /^[a-z_]{3,30}$/.test(sp.sourceType) ? sp.sourceType : undefined,
    cursor: sp.cursor && /^\d+$/.test(sp.cursor) ? sp.cursor : undefined,
  };
  const page = await listJournals(await loadContext(), entityId, filters);
  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <PageHeader
        title="Journals"
        description="Every entry in the ledger. Posted entries are permanent; corrections are reversals."
        actions={
          entity.permissions.includes("journal.manual.post") ? (
            <Button asChild>
              <Link href={`/e/${entityId}/journals/new`}>
                <Plus aria-hidden />
                New journal
              </Link>
            </Button>
          ) : null
        }
      />
      <JournalsView entityId={entityId} filters={filters} page={page} />
    </div>
  );
}
