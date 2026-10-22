"use client";

import { formatMoney } from "@kedge/core";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const monthFmt = new Intl.DateTimeFormat("en-NG", { month: "short", timeZone: "UTC" });

/**
 * Money in vs money out, last six months. Chart values are converted to
 * whole naira for plotting only; labels use the exact formatter.
 */
export function TrendChart({ data }: { data: { month: string; moneyIn: string; moneyOut: string }[] }) {
  const rows = data.map((d) => ({
    label: monthFmt.format(new Date(`${d.month}-01T00:00:00Z`)),
    moneyIn: Number(BigInt(d.moneyIn) / 100n),
    moneyOut: Number(BigInt(d.moneyOut) / 100n),
    exactIn: d.moneyIn,
    exactOut: d.moneyOut,
  }));
  const compact = new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 });
  return (
    <figure className="h-56" aria-label="Money in and money out over the last six months">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--color-muted)", fontSize: 12 }} tickFormatter={(v: number) => `₦${compact.format(v)}`} />
          <Tooltip
            cursor={{ fill: "var(--color-subtle)" }}
            contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
            formatter={(_v, name, item) => [formatMoney(BigInt(name === "moneyIn" ? item.payload.exactIn : item.payload.exactOut)), name === "moneyIn" ? "Money in" : "Money out"]}
          />
          <Bar dataKey="moneyIn" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="moneyOut" fill="var(--color-warning)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <figcaption className="sr-only">
        {data.map((d) => `${d.month}: in ${formatMoney(BigInt(d.moneyIn))}, out ${formatMoney(BigInt(d.moneyOut))}`).join("; ")}
      </figcaption>
    </figure>
  );
}
