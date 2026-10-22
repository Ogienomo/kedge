import { Card } from "@kedge/ui";
import { ChevronRight, FileBarChart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { REPORTS } from "@/components/reports/catalogue";
import { loadEntityOrgId, loadOrg } from "@/server/loaders";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity || !entity.permissions.includes("report.view")) notFound();
  const simple = entity.displayMode === "simple";
  const list = REPORTS.filter((r) => !(simple && r.accountantOnly));
  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <PageHeader title="Reports" description="Computed from your posted entries, with integrity checks on every run." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((r) => (
          <li key={r.key}>
            <Card className="h-full transition-colors hover:border-border-strong">
              <Link href={`/e/${entityId}/reports/${r.key}`} className="flex h-full items-center gap-3 rounded-lg p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <FileBarChart aria-hidden className="size-5" />
                </span>
                <span className="grid flex-1 gap-0.5">
                  <span className="font-medium">{simple ? r.simpleTitle : r.title}</span>
                  <span className="text-sm text-muted">{simple ? r.simpleDescription : r.description}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 text-muted" />
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
