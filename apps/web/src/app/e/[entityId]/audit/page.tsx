import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { listAudit } from "@/server/services/ledger/insights";
import { AuditView } from "./audit-view";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { entityId } = await params;
  const sp = await searchParams;
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity || !entity.permissions.includes("audit_log.view")) notFound();
  const iso = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const filters = {
    from: iso(sp.from),
    to: iso(sp.to),
    action: sp.action && /^[a-z_.]{1,64}$/.test(sp.action) ? sp.action : undefined,
    cursor: sp.cursor && /^\d+$/.test(sp.cursor) ? sp.cursor : undefined,
  };
  const page = await listAudit(await loadContext(), entityId, filters);
  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <PageHeader title="Audit log" description="Every change made to this business’s books, who made it and when. Entries can never be edited or deleted." />
      <AuditView filters={filters} page={page} />
    </div>
  );
}
