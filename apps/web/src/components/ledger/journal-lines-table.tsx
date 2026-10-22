import { Amount } from "./amount";

export function JournalLinesTable({ lines }: { lines: { lineNo: number; accountCode: string; accountName: string; debit: string; credit: string; description: string | null; contactName: string | null }[] }) {
  const totalDebit = lines.reduce((s, l) => s + BigInt(l.debit), 0n);
  const totalCredit = lines.reduce((s, l) => s + BigInt(l.credit), 0n);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <caption className="sr-only">Journal lines</caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th scope="col" className="py-2 text-left font-medium">
              Account
            </th>
            <th scope="col" className="py-2 text-left font-medium">
              Description
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Debit
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Credit
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lineNo} className="border-b border-border last:border-0">
              <td className="py-2">
                <span className="mr-2 text-muted tabular">{l.accountCode}</span>
                {l.accountName}
              </td>
              <td className="py-2 text-muted">{l.description ?? l.contactName ?? ""}</td>
              <td className="py-2">{l.debit !== "0" ? <Amount minor={l.debit} className="block" /> : null}</td>
              <td className="py-2">{l.credit !== "0" ? <Amount minor={l.credit} className="block" /> : null}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td className="pt-2" colSpan={2}>
              Total
            </td>
            <td className="pt-2">
              <Amount minor={totalDebit} className="block" />
            </td>
            <td className="pt-2">
              <Amount minor={totalCredit} className="block" />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
