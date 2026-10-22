import { roleLabel } from "@kedge/core";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kedge/ui";
import { BookOpen, Landmark, Scale, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { loadEntityOrgId, loadOrg } from "@/server/loaders";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Phase 0 dashboard: the frame of the entity workspace. Cash position,
 * money in/out and the set-up checklist arrive with the ledger (Phase 1).
 */
export default async function DashboardPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  const simple = entity.displayMode === "simple";

  const upcoming = simple
    ? [
        { icon: Wallet, title: "Cash position", text: "How much money you have across your bank accounts." },
        { icon: BookOpen, title: "Money in and money out", text: "What came in and what went out this month." },
        { icon: Landmark, title: "Needs your attention", text: "Items to categorise and accounts to check." },
      ]
    : [
        { icon: Scale, title: "Trial balance check", text: "Debits equal credits, checked on every report." },
        { icon: Landmark, title: "Suspense and drafts", text: "Unclassified balances and unposted entries." },
        { icon: BookOpen, title: "Period status", text: "Open, locked and closed periods for the year." },
      ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={entity.tradingName ?? entity.legalName}
        description={entity.tradingName ? entity.legalName : undefined}
        actions={<Badge tone="primary">{roleLabel(entity.role)}</Badge>}
      />
      <Card>
        <CardHeader>
          <CardTitle>{simple ? "Your books are ready to set up" : "Ledger not yet configured"}</CardTitle>
          <CardDescription>
            {simple
              ? "Next you'll choose your categories, add your bank accounts and enter what you had on day one."
              : "Next: chart of accounts template, fiscal year, bank accounts and opening balances."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-3">
            {upcoming.map((u) => (
              <li key={u.title} className="grid gap-2 rounded-lg border border-dashed border-border-strong p-4">
                <u.icon aria-hidden className="size-5 text-muted" />
                <p className="text-sm font-medium">{u.title}</p>
                <p className="text-xs text-muted">{u.text}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
