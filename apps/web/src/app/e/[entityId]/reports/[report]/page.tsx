import type { ReportResponse } from "@kedge/api";
import { ValidationError } from "@kedge/core";
import { Alert, Card, CardContent, EmptyState } from "@kedge/ui";
import { FileBarChart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Amount, formatDate } from "@/components/ledger/amount";
import { PageHeader } from "@/components/page-header";
import { reportInfo } from "@/components/reports/catalogue";
import { loadContext, loadEntityDetail, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { runReport } from "@/server/services/ledger/reports";
import { ReportParams } from "./report-params";

export const metadata: Metadata = { title: "Report" };

type Statement = Extract<ReportResponse, { report: "income-statement" | "balance-sheet" }>;
type Section = Extract<ReportResponse, { report: "income-statement" }>["revenue"];
type Figure = { amount: string; comparative: string | null };

const LABELS = {
  accountant: {
    revenue: "Revenue",
    cost_of_sales: "Cost of sales",
    gross: "Gross profit",
    operating_expenses: "Operating expenses",
    operating: "Operating profit",
    other_income: "Other income",
    finance_costs: "Finance costs",
    pbt: "Profit before tax",
    income_tax: "Income tax",
    profit: "Profit for the period",
    non_current_assets: "Non-current assets",
    current_assets: "Current assets",
    assets: "Total assets",
    equity: "Equity",
    prior: "Retained profit from earlier years",
    cye: "Current year earnings",
    equity_total: "Total equity",
    non_current_liabilities: "Non-current liabilities",
    current_liabilities: "Current liabilities",
    liabilities: "Total liabilities",
  },
  simple: {
    revenue: "Money earned from sales",
    cost_of_sales: "Direct costs",
    gross: "Gross profit",
    operating_expenses: "Running costs",
    operating: "Operating profit",
    other_income: "Other income",
    finance_costs: "Interest and loan costs",
    pbt: "Profit before tax",
    income_tax: "Tax",
    profit: "Profit",
    non_current_assets: "Long-term things you own",
    current_assets: "Money and short-term things you own",
    assets: "Total owned",
    equity: "Owners' money in the business",
    prior: "Profit kept from earlier years",
    cye: "Profit so far this year",
    equity_total: "Total owners' stake",
    non_current_liabilities: "Long-term debts",
    current_liabilities: "Bills and short-term debts",
    liabilities: "Total owed",
  },
} as const;

export default async function ReportPage({ params, searchParams }: { params: Promise<{ entityId: string; report: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { entityId, report } = await params;
  const sp = await searchParams;
  const info = reportInfo(report);
  if (!info) notFound();
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity || !entity.permissions.includes("report.view")) notFound();
  const detail = await loadEntityDetail(entityId);
  const simple = entity.displayMode === "simple";
  const L = LABELS[simple ? "simple" : "accountant"];
  const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const compare = sp.compare === "previous_period" || sp.compare === "previous_year" ? sp.compare : "none";
  const includeZero = sp.includeZero === "true";

  let data: ReportResponse;
  try {
    data = await runReport(await loadContext(), entityId, info.key, { from: iso(sp.from), to: iso(sp.to), asOf: iso(sp.asOf), compare, includeZero, accountId: sp.accountId });
  } catch (e) {
    if (e instanceof ValidationError) {
      return (
        <div className="mx-auto max-w-5xl">
          <Alert tone="danger" title={e.message} />
        </div>
      );
    }
    throw e;
  }

  const failed = data.checks.filter((c) => !c.passed);
  const range = "asOf" in data ? { from: undefined, to: data.asOf } : { from: data.from, to: data.to };
  const drill = (accountId: string) => `/e/${entityId}/accounts/${accountId}?${new URLSearchParams(Object.entries({ from: range.from, to: range.to }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`;
  const subtitle = "asOf" in data ? `As at ${formatDate(data.asOf)}` : `${formatDate(data.from)} to ${formatDate(data.to)}`;
  const exportBase = entity.permissions.includes("data.export") ? `/api/v1/entities/${entityId}/reports/export?report=${info.key}` : null;

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <Link href={`/e/${entityId}/reports`} className="w-fit text-sm text-primary hover:underline print:hidden">
        ← Reports
      </Link>
      <PageHeader title={simple ? info.simpleTitle : info.title} description={`${entity.tradingName ?? entity.legalName} · ${subtitle} · Accrual basis`} />
      <ReportParams
        kind={info.kind}
        values={{ from: "from" in data ? data.from : undefined, to: "to" in data ? data.to : undefined, asOf: "asOf" in data ? data.asOf : undefined, compare, includeZero }}
        allowCompare={info.key === "income-statement" || info.key === "balance-sheet"}
        exportBase={exportBase}
        today={detail.today}
      />
      {failed.length > 0 ? (
        <Alert tone="danger" title="Integrity check failed: do not rely on this report">
          {failed.map((c) => c.detail).join(" · ")}. This is a defect and has been flagged for investigation.
        </Alert>
      ) : null}
      <Card className="overflow-hidden">
        <CardContent className="p-0 sm:p-0">{render(data, { simple, L, drill, entityId })}</CardContent>
      </Card>
    </div>
  );
}

interface Ctx {
  simple: boolean;
  L: (typeof LABELS)["accountant" | "simple"];
  drill: (accountId: string) => string;
  entityId: string;
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th scope="col" className={`px-4 py-2.5 text-xs font-medium text-muted ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Table({ caption, head, children, foot }: { caption: string; head: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-subtle/60">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
        {foot ? <tfoot>{foot}</tfoot> : null}
      </table>
    </div>
  );
}

function render(data: ReportResponse, ctx: Ctx): ReactNode {
  switch (data.report) {
    case "income-statement":
    case "balance-sheet":
      return <StatementView data={data} ctx={ctx} />;
    case "trial-balance":
      return (
        <Table
          caption="Trial balance"
          head={
            <>
              <Th>Code</Th>
              <Th>Account</Th>
              <Th right>Debit</Th>
              <Th right>Credit</Th>
            </>
          }
          foot={
            <tr className="border-t-2 border-border font-semibold">
              <td className="px-4 py-2.5" colSpan={2}>
                Total
              </td>
              <td className="px-4 py-2.5">
                <Amount minor={data.totalDebit} className="block" />
              </td>
              <td className="px-4 py-2.5">
                <Amount minor={data.totalCredit} className="block" />
              </td>
            </tr>
          }
        >
          {data.rows.map((r) => (
            <tr key={r.account.id} className="border-b border-border">
              <td className="px-4 py-2 text-muted tabular">{r.account.code}</td>
              <td className="px-4 py-2">
                <Link href={ctx.drill(r.account.id)} className="hover:text-primary hover:underline">
                  {r.account.name}
                </Link>
              </td>
              <td className="px-4 py-2">{r.debit !== "0" ? <Amount minor={r.debit} className="block" /> : null}</td>
              <td className="px-4 py-2">{r.credit !== "0" ? <Amount minor={r.credit} className="block" /> : null}</td>
            </tr>
          ))}
        </Table>
      );
    case "general-ledger":
      return data.accounts.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={<FileBarChart />} title="No activity in this period" />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {data.accounts.map((a) => (
            <section key={a.account.id} className="grid gap-2 p-4">
              <h3 className="flex justify-between text-sm font-semibold">
                <Link href={ctx.drill(a.account.id)} className="hover:text-primary hover:underline">
                  {a.account.code} · {a.account.name}
                </Link>
                <span className="text-muted">
                  Opening <Amount minor={a.opening} /> · Closing <Amount minor={a.closing} />
                </span>
              </h3>
              <ul className="grid gap-1 text-sm">
                {a.rows.map((r, i) => (
                  <li key={`${r.entryId}-${i}`} className="grid grid-cols-[6.5rem_7.5rem_1fr_8rem_8rem] gap-2">
                    <span className="text-muted">{formatDate(r.date)}</span>
                    <Link href={`/e/${ctx.entityId}/journals/${r.entryId}`} className="text-primary tabular hover:underline">
                      {r.entryNumber}
                    </Link>
                    <span className="truncate">{r.description ?? r.memo}</span>
                    <span>{r.debit !== "0" ? <Amount minor={r.debit} className="block" /> : null}</span>
                    <span>{r.credit !== "0" ? <Amount minor={r.credit} className="block" /> : null}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      );
    case "journal":
      return data.entries.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={<FileBarChart />} title="No entries in this period" />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {data.entries.map((e) => (
            <section key={e.entryId} className="grid gap-1.5 p-4 text-sm">
              <h3 className="flex flex-wrap gap-x-3 font-semibold">
                <Link href={`/e/${ctx.entityId}/journals/${e.entryId}`} className="text-primary tabular hover:underline">
                  {e.number}
                </Link>
                <span className="font-normal text-muted">{formatDate(e.date)}</span>
                <span className="font-normal">{e.memo}</span>
              </h3>
              {e.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_8rem_8rem] gap-2">
                  <span className={l.credit !== "0" ? "pl-6" : ""}>
                    {l.account.code} · {l.account.name}
                  </span>
                  <span>{l.debit !== "0" ? <Amount minor={l.debit} className="block" /> : null}</span>
                  <span>{l.credit !== "0" ? <Amount minor={l.credit} className="block" /> : null}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      );
    case "expense-by-category":
    case "income-by-source":
      return data.rows.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={<FileBarChart />} title="Nothing in this period" />
        </div>
      ) : (
        <ul className="grid gap-3 p-4">
          {data.rows.map((r) => (
            <li key={r.account.id} className="grid gap-1">
              <div className="flex justify-between gap-2 text-sm">
                <Link href={ctx.drill(r.account.id)} className="truncate hover:text-primary hover:underline">
                  {r.account.name}
                </Link>
                <span className="flex gap-3">
                  <span className="w-12 text-right text-muted tabular">{Math.round(r.shareBps / 100)}%</span>
                  <Amount minor={r.amount} className="w-32" />
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${r.shareBps / 100}%` }} />
              </div>
            </li>
          ))}
          <li className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>Total</span>
            <Amount minor={data.total} />
          </li>
        </ul>
      );
  }
}

function StatementView({ data, ctx }: { data: Statement; ctx: Ctx }) {
  const cmp = data.report === "income-statement" ? data.comparativeFrom !== null : data.comparativeAsOf !== null;
  const cmpLabel =
    data.report === "income-statement"
      ? data.comparativeFrom && data.comparativeTo
        ? `${formatDate(data.comparativeFrom)} – ${formatDate(data.comparativeTo)}`
        : ""
      : data.comparativeAsOf
        ? formatDate(data.comparativeAsOf)
        : "";
  const L = ctx.L;

  const section = (key: keyof typeof L, s: Section) => (
    <>
      <tr>
        <th scope="rowgroup" colSpan={cmp ? 3 : 2} className="px-4 pt-4 pb-1 text-left text-xs font-semibold tracking-wide text-muted uppercase">
          {L[key]}
        </th>
      </tr>
      {s.rows.map((r) => (
        <tr key={r.account.id}>
          <td className="py-1.5 pr-4 pl-6">
            <Link href={ctx.drill(r.account.id)} className="hover:text-primary hover:underline">
              {r.account.name}
            </Link>
          </td>
          <td className="px-4 py-1.5">
            <Amount minor={r.amount} className="block" muteZero />
          </td>
          {cmp ? (
            <td className="px-4 py-1.5 text-muted">
              <Amount minor={r.comparative ?? "0"} className="block" muteZero />
            </td>
          ) : null}
        </tr>
      ))}
      {s.rows.length === 0 ? (
        <tr>
          <td className="py-1.5 pr-4 pl-6 text-muted italic" colSpan={cmp ? 3 : 2}>
            None
          </td>
        </tr>
      ) : null}
      <tr className="font-medium">
        <td className="border-t border-border py-1.5 pr-4 pl-6">Total {L[key].toLowerCase()}</td>
        <td className="border-t border-border px-4 py-1.5">
          <Amount minor={s.total} className="block" />
        </td>
        {cmp ? (
          <td className="border-t border-border px-4 py-1.5">
            <Amount minor={s.comparativeTotal ?? "0"} className="block" />
          </td>
        ) : null}
      </tr>
    </>
  );
  const total = (key: keyof typeof L, f: Figure, strong = false) => (
    <tr className={strong ? "font-semibold" : "font-medium"}>
      <td className={`px-4 py-2.5 ${strong ? "border-y-2 border-border" : ""}`}>{L[key]}</td>
      <td className={`px-4 py-2.5 ${strong ? "border-y-2 border-border" : ""}`}>
        <Amount minor={f.amount} className="block" />
      </td>
      {cmp ? (
        <td className={`px-4 py-2.5 ${strong ? "border-y-2 border-border" : ""}`}>
          <Amount minor={f.comparative ?? "0"} className="block" />
        </td>
      ) : null}
    </tr>
  );

  return (
    <Table
      caption={data.report === "income-statement" ? "Income statement" : "Balance sheet"}
      head={
        <>
          <Th>{""}</Th>
          <Th right>{"asOf" in data ? formatDate(data.asOf) : "This period"}</Th>
          {cmp ? <Th right>{cmpLabel}</Th> : null}
        </>
      }
    >
      {data.report === "income-statement" ? (
        <>
          {section("revenue", data.revenue)}
          {section("cost_of_sales", data.costOfSales)}
          {total("gross", data.grossProfit)}
          {section("operating_expenses", data.operatingExpenses)}
          {total("operating", data.operatingProfit)}
          {section("other_income", data.otherIncome)}
          {section("finance_costs", data.financeCosts)}
          {total("pbt", data.profitBeforeTax)}
          {section("income_tax", data.incomeTax)}
          {total("profit", data.profitForPeriod, true)}
        </>
      ) : (
        <>
          {section("non_current_assets", data.nonCurrentAssets)}
          {section("current_assets", data.currentAssets)}
          {total("assets", data.totalAssets, true)}
          {section("equity", data.equity)}
          {total("prior", data.priorYearsEarnings)}
          {total("cye", data.currentYearEarnings)}
          {total("equity_total", data.totalEquity)}
          {section("non_current_liabilities", data.nonCurrentLiabilities)}
          {section("current_liabilities", data.currentLiabilities)}
          {total("liabilities", data.totalLiabilities)}
          {total(
            "equity_total",
            {
              amount: (BigInt(data.totalEquity.amount) + BigInt(data.totalLiabilities.amount)).toString(),
              comparative: data.totalEquity.comparative === null ? null : (BigInt(data.totalEquity.comparative) + BigInt(data.totalLiabilities.comparative ?? "0")).toString(),
            },
            true,
          )}
        </>
      )}
    </Table>
  );
}
