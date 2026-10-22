import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kedge/ui";
import { CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { PageHeader } from "@/components/page-header";
import { loadEntityDetail, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { OpeningBalancesSection } from "./opening-balances-section";

export const metadata: Metadata = { title: "Set-up" };

/** SPEC §6.2 set-up checklist (Phase 1 items; import and reconciliation arrive in Phase 2). */
export default async function SetupPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const [detail, org] = await Promise.all([loadEntityDetail(entityId), loadOrg(await loadEntityOrgId(entityId))]);
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  const canSetUp = entity.permissions.includes("entity.settings.edit") && entity.permissions.includes("coa.edit");

  if (!detail.booksReady) {
    return canSetUp ? (
      <SetupWizard entityId={entityId} today={detail.today} defaults={{ legalName: detail.legalName, tradingName: detail.tradingName }} noun={org.organisation.kind === "firm" ? "client" : "business"} />
    ) : (
      <PageHeader title="Books not set up yet" description="An owner or accountant needs to set up the books for this business." />
    );
  }

  const items = [
    { done: detail.setup.coaReviewed, label: "Categories chosen", href: `/e/${entityId}/accounts` },
    { done: detail.setup.bankAccountsAdded, label: "Bank accounts added", href: `/e/${entityId}/accounts` },
    { done: detail.setup.openingBalancesDone, label: "Opening balances entered", href: null },
  ];
  const done = items.filter((i) => i.done).length;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader title="Set-up checklist" description={`${done} of ${items.length} done`} />
      <Card>
        <CardContent>
          <ul className="grid gap-3">
            {items.map((i) => (
              <li key={i.label} className="flex items-center gap-3 text-sm">
                {i.done ? <CheckCircle2 aria-hidden className="size-5 text-success" /> : <Circle aria-hidden className="size-5 text-muted" />}
                <span className={i.done ? "text-muted line-through" : "font-medium"}>{i.label}</span>
                <span className="sr-only">{i.done ? "(done)" : "(to do)"}</span>
                {!i.done && i.href ? (
                  <Link href={i.href} className="ml-auto text-primary hover:underline">
                    Open
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {!detail.setup.openingBalancesDone && entity.permissions.includes("journal.manual.post") && detail.goLiveDate ? (
        <Card>
          <CardHeader>
            <CardTitle>Opening balances</CardTitle>
            <CardDescription>
              {detail.setup.openingBalanceEquity !== "0"
                ? "Opening balances were entered but do not balance yet. Post a correcting journal to clear opening balance equity."
                : "Enter what each account held the day before you started recording here."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OpeningBalancesSection entityId={entityId} goLiveDate={detail.goLiveDate} simple={entity.displayMode === "simple"} alreadyPosted={detail.setup.openingBalanceEquity !== "0"} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
