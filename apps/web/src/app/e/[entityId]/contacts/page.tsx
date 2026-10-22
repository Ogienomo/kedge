import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { listContacts } from "@/server/services/ledger/directory";
import { ContactsView } from "./contacts-view";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  const { contacts } = await listContacts(await loadContext(), entityId);
  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <PageHeader title="Contacts" description="Customers, suppliers and anyone else you deal with." />
      <ContactsView entityId={entityId} contacts={contacts} canEdit={entity.permissions.includes("transaction.create")} />
    </div>
  );
}
