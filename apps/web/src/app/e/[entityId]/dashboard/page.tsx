import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@kedge/ui";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronRight, Landmark, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Amount, formatDate } from "@/components/ledger/amount";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityDetail, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { getDashboard } from "@/server/services/ledger/insights";
import { TrendChart } from "./trend-chart";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const [org, detail] = await Promise.all([loadOrg(await loadEntityOrgId(entityId)), loadEntityDetail(entityId)]);
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  const title = entity.tradingName ?? entity.legalName;

  if (!detail.booksReady) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={title} />
        <EmptyState
          icon={<Landmark />}
          title="Set up the books"
          description="Choose your categories, add your bank accounts and enter what you had on day one. It takes about five minutes."
          action={
            <Button asChild>
              <Link href={`/e/${entityId}/setup`}>Start set-up</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const d = await getDashboard(await loadContext(), entityId);
  const simple = entity.displayMode === "simple";
  const seesLedger = entity.permissions.includes("report.view");
  const maxExpense = d.topExpenses.reduce((m, e) => (BigInt(e.amount) > m ? BigInt(e.amount) : m), 1n);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader title={title} description={`As at ${formatDate(d.today)}`} />

      {!d.accountant.trialBalanceBalanced ? (
        <Alert tone="danger" title="Integrity check failed: the trial balance does not balance">
          This should never happen. Our team has been alerted. Do not rely on reports until it is resolved.
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardDescription>{simple ? "Money you have" : "Cash and bank"}</CardDescription>
            <Wallet aria-hidden className="size-4 text-muted" />
          </CardHeader>
          <CardContent className="grid gap-3">
            <Amount minor={d.cash.total} className="text-2xl font-semibold" />
            <ul className="grid gap-1 text-sm">
              {d.cash.accounts.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="truncate text-muted">{a.name}</span>
                  <Amount minor={a.balance} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardDescription>Money in this month</CardDescription>
            <ArrowDownLeft aria-hidden className="size-4 text-success" />
          </CardHeader>
          <CardContent>
            <Amount minor={d.thisMonth.moneyIn} className="text-2xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardDescription>Money out this month</CardDescription>
            <ArrowUpRight aria-hidden className="size-4 text-warning" />
          </CardHeader>
          <CardContent>
            <Amount minor={d.thisMonth.moneyOut} className="text-2xl font-semibold" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Money in and out</CardTitle>
            <CardDescription>
              <span className="mr-3 inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm bg-primary" /> Money in
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm bg-warning" /> Money out
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>{seesLedger ? <TrendChart data={d.trend} /> : <p className="text-sm text-muted">Your role does not include reports.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{simple ? "Where money went this month" : "Top expenses this month"}</CardTitle>
          </CardHeader>
          <CardContent>
            {d.topExpenses.length === 0 ? (
              <p className="text-sm text-muted">Nothing spent yet this month.</p>
            ) : (
              <ul className="grid gap-3">
                {d.topExpenses.map((e) => (
                  <li key={e.name} className="grid gap-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{e.name}</span>
                      <Amount minor={e.amount} />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Number((BigInt(e.amount) * 100n) / maxExpense)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs your attention</CardTitle>
          </CardHeader>
          <CardContent>
            {d.attention.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <CheckCircle2 aria-hidden className="size-4 text-success" /> All clear.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {d.attention.map((a) => (
                  <li key={a.kind}>
                    <Link href={a.href ?? "#"} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary">
                      <AlertTriangle aria-hidden className="size-4 shrink-0 text-warning" />
                      <span className="flex-1">{a.message}</span>
                      <ChevronRight aria-hidden className="size-4 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {!simple ? (
          <Card>
            <CardHeader>
              <CardTitle>Ledger health</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-sm">
                <dt className="text-muted">Trial balance</dt>
                <dd>{d.accountant.trialBalanceBalanced ? <Badge tone="success">Balanced</Badge> : <Badge tone="danger">Out of balance</Badge>}</dd>
                <dt className="text-muted">Suspense</dt>
                <dd>
                  <Amount minor={d.accountant.suspenseBalance} muteZero />
                </dd>
                <dt className="text-muted">Draft entries</dt>
                <dd className="tabular">{d.accountant.draftCount}</dd>
                <dt className="text-muted">Current period</dt>
                <dd>{d.accountant.currentPeriod ? <Badge tone={d.accountant.currentPeriod.status === "open" ? "primary" : "warning"}>{d.accountant.currentPeriod.status}</Badge> : "—"}</dd>
                <dt className="text-muted">Locked to</dt>
                <dd>{d.accountant.latestLockedPeriodEnd ? formatDate(d.accountant.latestLockedPeriodEnd) : "Nothing locked"}</dd>
              </dl>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
