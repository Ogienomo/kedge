import { Button, EmptyState } from "@kedge/ui";
import { Briefcase, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadCurrentOrgId, loadOrg } from "@/server/loaders";
import { listPracticeClients } from "@/server/services/ledger/insights";
import { PracticeTable } from "./practice-table";

export const metadata: Metadata = { title: "Clients" };

/** SPEC §6.3 practice workspace (Phase 1: basic client list). */
export default async function PracticePage() {
  const orgId = await loadCurrentOrgId();
  const org = await loadOrg(orgId);
  if (org.organisation.kind !== "firm" || org.role === null) redirect("/");
  const { clients } = await listPracticeClients(await loadContext(), orgId);
  const canCreate = org.orgPermissions.includes("entity.create");

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <PageHeader
        title="Clients"
        description={`Client businesses managed by ${org.organisation.name}.`}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/practice/clients/new">
                <Plus aria-hidden />
                Add client
              </Link>
            </Button>
          ) : null
        }
      />
      {clients.length === 0 ? (
        <EmptyState
          icon={<Briefcase />}
          title={canCreate ? "Add your first client" : "No clients assigned to you yet"}
          description={canCreate ? "Each client gets its own books. Invite your team and the client's staff once it's added." : "An owner or admin can assign you to client businesses."}
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/practice/clients/new">Add client</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <PracticeTable clients={clients} />
      )}
    </div>
  );
}
