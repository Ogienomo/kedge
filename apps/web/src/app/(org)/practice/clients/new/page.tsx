import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { PageHeader } from "@/components/page-header";
import { loadCurrentOrgId, loadOrg, todayInLagos } from "@/server/loaders";

export const metadata: Metadata = { title: "Add a client" };

/** SPEC §6.3: add client runs the business wizard under the firm org. */
export default async function NewClientPage() {
  const orgId = await loadCurrentOrgId();
  const org = await loadOrg(orgId);
  if (!org.orgPermissions.includes("entity.create")) redirect("/practice");
  return (
    <div className="grid gap-2">
      <PageHeader title="Add a client" description="Set up a new set of books for a client business." />
      <SetupWizard orgId={orgId} today={todayInLagos()} noun="client" />
    </div>
  );
}
