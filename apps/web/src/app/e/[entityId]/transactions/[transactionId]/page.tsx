import { NotFoundError } from "@kedge/core";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@kedge/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Amount, formatDate } from "@/components/ledger/amount";
import { JournalLinesTable } from "@/components/ledger/journal-lines-table";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadEntityOrgId, loadOrg } from "@/server/loaders";
import { getJournal } from "@/server/services/ledger/journals";
import { getTransaction } from "@/server/services/ledger/transactions";
import { KIND_LABELS, STATUS_TONE } from "../transactions-view";
import { TransactionActions } from "./transaction-actions";

export const metadata: Metadata = { title: "Transaction" };

export default async function TransactionPage({ params }: { params: Promise<{ entityId: string; transactionId: string }> }) {
  const { entityId, transactionId } = await params;
  const ctx = await loadContext();
  const org = await loadOrg(await loadEntityOrgId(entityId));
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) notFound();
  const t = await getTransaction(ctx, transactionId).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const simple = entity.displayMode === "simple";
  const canSeeLedger = entity.permissions.includes("report.view");
  const journal = t.journalEntryId && canSeeLedger ? await getJournal(ctx, t.journalEntryId) : null;
  const reversal = journal?.reversedByEntryId && canSeeLedger ? await getJournal(ctx, journal.reversedByEntryId) : null;

  const facts: [string, React.ReactNode][] = [
    ["Date", formatDate(t.txnDate)],
    ["Type", KIND_LABELS[t.kind]],
    [t.kind === "transfer" ? "From" : "Bank account", t.bankAccountName],
    [t.kind === "transfer" ? "To" : simple ? "Category" : "Account", t.counterAccountName],
    ["Contact", t.contactName ?? "—"],
    ["Reference", t.reference ?? "—"],
  ];

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Link href={`/e/${entityId}/transactions`} className="w-fit text-sm text-primary hover:underline">
        ← All transactions
      </Link>
      <PageHeader
        title={t.contactName ?? t.counterAccountName}
        description={`${KIND_LABELS[t.kind]} · ${formatDate(t.txnDate)}`}
        actions={
          <TransactionActions
            transaction={t}
            canPost={entity.permissions.includes("transaction.post")}
            canReverse={entity.permissions.includes("journal.reverse")}
            journalNumber={journal?.number ?? null}
          />
        }
      />
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Status</span>
              <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Amount</span>
              <Amount minor={t.amount} />
            </div>
            {t.breakdown.vat !== "0" ? (
              <div className="flex justify-between">
                <span className="text-muted">of which VAT</span>
                <Amount minor={t.breakdown.vat} />
              </div>
            ) : null}
            {t.breakdown.wht !== "0" ? (
              <div className="flex justify-between">
                <span className="text-muted">Tax withheld (WHT)</span>
                <Amount minor={t.breakdown.wht} />
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 font-medium">
              <span>{["money_in", "owner_in", "loan_in"].includes(t.kind) ? "Received" : "Paid"}</span>
              <Amount minor={t.breakdown.bank} />
            </div>
          </CardContent>
        </Card>
      </div>

      {journal && !simple ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              Journal <Link href={`/e/${entityId}/journals/${journal.id}`} className="text-primary hover:underline">{journal.number}</Link>
            </CardTitle>
            {reversal ? (
              <span className="text-sm text-muted">
                Reversed by{" "}
                <Link href={`/e/${entityId}/journals/${reversal.id}`} className="text-primary hover:underline">
                  {reversal.number}
                </Link>
              </span>
            ) : null}
          </CardHeader>
          <CardContent>
            <JournalLinesTable lines={journal.lines} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
