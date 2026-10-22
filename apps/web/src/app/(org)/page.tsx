import { roleLabel } from "@kedge/core";
import { Badge, Button, Card, EmptyState } from "@kedge/ui";
import { ChevronRight, Landmark } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadCurrentOrgId, loadOrg } from "@/server/loaders";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { add } = await searchParams;
  const org = await loadOrg(await loadCurrentOrgId());
  const canCreate = org.orgPermissions.includes("entity.create");
  const isFirm = org.organisation.kind === "firm";

  // Firms work from the practice list (a new firm starts in its set-up wizard);
  // a business goes straight to its books, or into onboarding when it has none yet.
  if (isFirm && org.role !== null) redirect(org.entities.length === 0 && org.orgPermissions.includes("org.users.manage") ? "/onboarding/firm" : "/practice");
  const only = org.entities.length === 1 ? org.entities[0] : undefined;
  if (!isFirm && only && !add) redirect(`/e/${only.id}/dashboard`);
  if (!isFirm && org.entities.length === 0 && canCreate) redirect("/onboarding/business");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={isFirm ? "Clients" : "Your businesses"}
        description={isFirm ? `Client businesses managed by ${org.organisation.name}.` : org.organisation.name}
        actions={
          canCreate && org.entities.length > 0 ? (
            <Button asChild variant="secondary">
              <Link href={isFirm ? "/practice/clients/new" : "/onboarding/business"}>Add {isFirm ? "client" : "business"}</Link>
            </Button>
          ) : null
        }
      />

      {org.entities.length === 0 ? (
        <EmptyState
          icon={<Landmark />}
          title={isFirm ? "Add your first client" : "Set up your business"}
          description={
            canCreate
              ? isFirm
                ? "Each client gets its own set of books. You can invite your team and the client's staff once it's added."
                : "Add your business to start a set of books. You can add more businesses later."
              : "You don't have access to any businesses here yet. Ask an admin to give you access."
          }
          action={
            canCreate ? (
              <Button asChild>
                <Link href={isFirm ? "/practice/clients/new" : "/onboarding/business"}>Set up</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {org.entities.map((e) => (
            <li key={e.id}>
              <Card className="transition-colors hover:border-border-strong">
                <Link href={`/e/${e.id}/dashboard`} className="flex items-center gap-3 rounded-lg p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                    <Landmark aria-hidden className="size-5" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="truncate font-medium">{e.tradingName ?? e.legalName}</span>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge>{roleLabel(e.role)}</Badge>
                      {e.status === "archived" ? <Badge tone="warning">Archived</Badge> : null}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
