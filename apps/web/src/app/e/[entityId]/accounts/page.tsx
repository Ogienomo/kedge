import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { listAccounts } from "@/server/services/ledger/accounts";
import { listBankAccounts } from "@/server/services/ledger/directory";
import { AccountsView } from "./accounts-view";

export const metadata: Metadata = { title: "Chart of accounts" };

export default async function AccountsPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const ctx = await loadContext();
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  const [{ accounts }, { bankAccounts }] = await Promise.all([listAccounts(ctx, entityId), listBankAccounts(ctx, entityId)]);
  const simple = entity.displayMode === "simple";
  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <PageHeader
        title={simple ? "Categories" : "Chart of accounts"}
        description={simple ? "Where money comes from and goes to, and what the business owns and owes." : "Every account in the ledger, with balances as at today."}
      />
      <AccountsView entityId={entityId} accounts={accounts} bankAccounts={bankAccounts} simple={simple} canEdit={entity.permissions.includes("coa.edit")} />
    </div>
  );
}
