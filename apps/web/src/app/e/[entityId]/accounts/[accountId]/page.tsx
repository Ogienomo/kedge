import { NotFoundError } from "@kedge/core";
import { Card, CardContent, EmptyState } from "@kedge/ui";
import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Amount, formatDate, formatNaira } from "@/components/ledger/amount";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityDetail, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { runReport } from "@/server/services/ledger/reports";
import { DateRangeForm } from "./date-range-form";

export const metadata: Metadata = { title: "Account ledger" };

/** SPEC §6.4: running-balance ledger for one account, with a date filter and drill to entries. */
export default async function AccountLedgerPage({ params, searchParams }: { params: Promise<{ entityId: string; accountId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { entityId, accountId } = await params;
  const sp = await searchParams;
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  if (!entity.permissions.includes("report.view")) notFound();
  const detail = await loadEntityDetail(entityId);
  const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const report = await runReport(await loadContext(), entityId, "general-ledger", { accountId, from: iso(sp.from), to: iso(sp.to) }).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (report.report !== "general-ledger") notFound();
  const ledger = report.accounts[0];
  if (!ledger) notFound();
  const simple = entity.displayMode === "simple";

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <Link href={`/e/${entityId}/accounts`} className="w-fit text-sm text-primary hover:underline">
        ← {simple ? "All categories" : "Chart of accounts"}
      </Link>
      <PageHeader title={simple ? ledger.account.name : `${ledger.account.code} · ${ledger.account.name}`} description={`${formatDate(report.from)} to ${formatDate(report.to)}`} />
      <DateRangeForm from={report.from} to={report.to} max={detail.today} />
      <Card className="overflow-hidden">
        <CardContent className="p-0 sm:p-0">
          {ledger.rows.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={<BookOpen />} title="No activity in this period" description={`Balance throughout: ${formatNaira(ledger.closing, "parentheses")}`} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">Ledger for {ledger.account.name}</caption>
                <thead>
                  <tr className="border-b border-border bg-subtle/60 text-xs text-muted">
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">
                      Entry
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">
                      Description
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      {simple ? "In" : "Debit"}
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      {simple ? "Out" : "Credit"}
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border text-muted">
                    <td className="px-3 py-2" colSpan={5}>
                      Opening balance
                    </td>
                    <td className="px-3 py-2">
                      <Amount minor={ledger.opening} className="block" />
                    </td>
                  </tr>
                  {ledger.rows.map((r, i) => (
                    <tr key={`${r.entryId}-${i}`} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {simple ? (
                          <span className="text-muted tabular">{r.entryNumber}</span>
                        ) : (
                          <Link href={`/e/${entityId}/journals/${r.entryId}`} className="text-primary tabular hover:underline">
                            {r.entryNumber}
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">{r.description ?? r.memo}</td>
                      <td className="px-3 py-2">{r.debit !== "0" ? <Amount minor={r.debit} className="block" /> : null}</td>
                      <td className="px-3 py-2">{r.credit !== "0" ? <Amount minor={r.credit} className="block" /> : null}</td>
                      <td className="px-3 py-2">
                        <Amount minor={r.balance} className="block" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td className="px-3 py-2.5" colSpan={3}>
                      Closing balance
                    </td>
                    <td className="px-3 py-2.5">
                      <Amount minor={ledger.totalDebit} className="block" />
                    </td>
                    <td className="px-3 py-2.5">
                      <Amount minor={ledger.totalCredit} className="block" />
                    </td>
                    <td className="px-3 py-2.5">
                      <Amount minor={ledger.closing} className="block" />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
