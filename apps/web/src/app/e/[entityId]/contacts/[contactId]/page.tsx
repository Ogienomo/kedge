import { NotFoundError } from "@kedge/core";
import { Card, CardContent, CardHeader, CardTitle } from "@kedge/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { listContacts } from "@/server/services/ledger/directory";
import { listTransactions } from "@/server/services/ledger/transactions";
import { TransactionsView } from "../../transactions/transactions-view";
import { EditContact } from "./edit-contact";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({ params }: { params: Promise<{ entityId: string; contactId: string }> }) {
  const { entityId, contactId } = await params;
  const ctx = await loadContext();
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  const { contacts } = await listContacts(ctx, entityId);
  const contact = contacts.find((c) => c.id === contactId);
  if (!contact) notFound();
  const history = await listTransactions(ctx, entityId, { contactId }).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const canEdit = entity.permissions.includes("transaction.create");
  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <Link href={`/e/${entityId}/contacts`} className="w-fit text-sm text-primary hover:underline">
        ← All contacts
      </Link>
      <PageHeader title={contact.name} description={[contact.email, contact.phone, contact.tin ? `TIN ${contact.tin}` : null].filter(Boolean).join(" · ") || undefined} actions={canEdit ? <EditContact contact={contact} /> : null} />
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionsView entityId={entityId} simple={entity.displayMode === "simple"} filters={{}} page={history} canRecord={false} />
        </CardContent>
      </Card>
    </div>
  );
}
