import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityDetail, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { listPeriods } from "@/server/services/ledger/periods";
import { PeriodsView } from "./periods-view";

export const metadata: Metadata = { title: "Periods" };

export default async function PeriodsPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  const [{ fiscalYears }, detail] = await Promise.all([listPeriods(await loadContext(), entityId), loadEntityDetail(entityId)]);
  const can = (p: string) => entity.permissions.includes(p as never);
  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <PageHeader title="Periods" description="Lock a month once its books are final. Nothing can be posted into a locked period." />
      <PeriodsView entityId={entityId} fiscalYears={[...fiscalYears].reverse()} today={detail.today} canLock={can("period.lock")} canUnlock={can("period.unlock")} canAddYear={can("entity.settings.edit")} />
    </div>
  );
}
