import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { listTransactions } from "@/server/services/ledger/transactions";
import { TransactionsView } from "./transactions-view";

export const metadata: Metadata = { title: "Transactions" };

const KINDS = ["money_in", "money_out", "transfer", "owner_in", "owner_out", "loan_in", "loan_repay"];

export default async function TransactionsPage({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { entityId } = await params;
  const sp = await searchParams;
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  const iso = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const filters = {
    from: iso(sp.from),
    to: iso(sp.to),
    kind: sp.kind && KINDS.includes(sp.kind) ? sp.kind : undefined,
    status: sp.status && ["draft", "posted", "reversed"].includes(sp.status) ? sp.status : undefined,
    cursor: sp.cursor && /^\d+$/.test(sp.cursor) ? sp.cursor : undefined,
  };
  const page = await listTransactions(await loadContext(), entityId, filters);
  const simple = entity.displayMode === "simple";
  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <PageHeader title={simple ? "Money in & out" : "Transactions"} description="Everything recorded for this business, newest first." />
      <TransactionsView entityId={entityId} simple={simple} filters={filters} page={page} canRecord={entity.permissions.includes("transaction.create")} />
    </div>
  );
}
