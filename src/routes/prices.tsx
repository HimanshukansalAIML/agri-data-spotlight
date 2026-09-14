import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Kpi, Loading, Panel, Shell } from "@/components/dashboard/Shell";
import { fmtNum, fmtRupee, useDataset } from "@/lib/dataset";
import { ALL, useFilters } from "@/lib/filters";
import { computeKpis, groupAvg, groupSum, useScope } from "@/lib/scope";

export const Route = createFileRoute("/prices")({
  head: () => ({
    meta: [
      { title: "Wholesale Price vs MSP — MandiGrid" },
      {
        name: "description",
        content:
          "Daily modal price against MSP, price crash instances and wholesale price distribution by crop and mandi.",
      },
      { property: "og:title", content: "Wholesale Price vs MSP — MandiGrid" },
      {
        property: "og:description",
        content: "Track modal price against MSP and spot price crash days by mandi.",
      },
    ],
  }),
  component: PricesPage,
});

function PricesPage() {
  const { data } = useDataset();
  const filters = useFilters();
  const scope = useScope(data, filters);
  const [mandi, setMandi] = useState<string>(ALL);

  const view = useMemo(() => {
    if (!scope) return null;
    const meta = scope.ds.meta;
    const k = computeKpis(scope);

    const rows = scope.prices.filter(
      (p) => mandi === ALL || meta.mandis[p[1]]?.name === mandi,
    );

    const byDateModal = groupAvg(rows, (r) => r[0], (r) => r[3]);
    const byDateMsp = groupAvg(rows, (r) => r[0], (r) => r[4]);
    const trend = [...byDateModal.keys()]
      .sort()
      .map((date) => ({
        date,
        modal: Math.round(byDateModal.get(date) ?? 0),
        msp: byDateMsp.has(date) ? Math.round(byDateMsp.get(date) ?? 0) : null,
      }));

    const arrivalsByDate = groupSum(
      scope.arrivals.filter((a) => mandi === ALL || meta.mandis[a[1]]?.name === mandi),
      (r) => r[0],
      (r) => r[3],
    );
    const trendWithArrivals = trend.map((t) => ({
      ...t,
      arrivals: Math.round(arrivalsByDate.get(t.date) ?? 0),
    }));

    const modals = rows.map((r) => r[3]).filter((v): v is number => v != null);
    const min = Math.min(...modals);
    const max = Math.max(...modals);
    const bins = 18;
    const width = (max - min) / bins || 1;
    const hist = Array.from({ length: bins }, (_, i) => ({
      bucket: `${Math.round(min + i * width)}`,
      count: 0,
    }));
    for (const v of modals) {
      const i = Math.min(bins - 1, Math.floor((v - min) / width));
      const slot = hist[i];
      if (slot) slot.count += 1;
    }

    const crashByCrop = new Map<string, { crashes: number; total: number }>();
    for (const p of rows) {
      if (p[3] == null || p[4] == null) continue;
      const c = meta.crops[p[2]] ?? "?";
      const cur = crashByCrop.get(c) ?? { crashes: 0, total: 0 };
      cur.total++;
      if (p[3] < p[4]) cur.crashes++;
      crashByCrop.set(c, cur);
    }
    const crashRows = [...crashByCrop]
      .map(([crop, v]) => ({ crop, ...v, rate: (v.crashes / v.total) * 100 }))
      .sort((a, b) => b.crashes - a.crashes);

    const mandiNames = [
      ALL,
      ...new Set(
        scope.ds.meta.mandis.filter((_, i) => scope.mandiInScope[i]).map((m) => m.name),
      ),
    ];

    return { k, trend: trendWithArrivals, hist, crashRows, mandiNames, recordCount: rows.length };
  }, [scope, mandi]);

  return (
    <Shell
      title="Prices & MSP"
      subtitle={`${filters.state} · ${filters.crop} · ${filters.days === 0 ? "all data" : `last ${filters.days} days`}`}
    >
      {!view ? (
        <Loading />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Avg modal price" value={fmtRupee(view.k.avgModal)} note="wholesale" />
            <Kpi label="Avg MSP" value={fmtRupee(view.k.avgMsp)} note="declared support" />
            <Kpi
              label="Gap vs MSP"
              value={`${view.k.mspGapPct >= 0 ? "+" : ""}${view.k.mspGapPct.toFixed(1)}%`}
              tone={view.k.mspGapPct >= 0 ? "positive" : "negative"}
            />
            <Kpi
              label="Price crashes"
              value={fmtNum(view.k.crashCount)}
              tone="negative"
              note={`${view.k.crashRate.toFixed(1)}% of priced records`}
            />
          </section>

          <Panel
            title="Daily modal price vs MSP"
            hint={`${view.recordCount} price records`}
          >
            <label className="mb-3 flex w-64 flex-col gap-0.5 rounded-lg border border-border bg-surface px-3 py-1.5">
              <span className="label-mono">Mandi</span>
              <select
                className="bg-transparent text-sm font-medium outline-none"
                value={mandi}
                onChange={(e) => setMandi(e.target.value)}
              >
                {view.mandiNames.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={view.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={30} />
                <YAxis yAxisId="p" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="a" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="p"
                  type="monotone"
                  dataKey="modal"
                  name="Modal price (₹)"
                  stroke="var(--color-chart-2)"
                  dot={false}
                />
                <Line
                  yAxisId="p"
                  type="monotone"
                  dataKey="msp"
                  name="MSP (₹)"
                  stroke="var(--color-chart-5)"
                  strokeDasharray="5 4"
                  dot={false}
                />
                <Line
                  yAxisId="a"
                  type="monotone"
                  dataKey="arrivals"
                  name="Arrivals (qtl)"
                  stroke="var(--color-chart-1)"
                  dot={false}
                  strokeOpacity={0.6}
                />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Wholesale price distribution" hint="modal price buckets (₹)">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={view.hist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 9 }} interval={1} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v} records`} />
                  <Bar dataKey="count" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Price crash instances by crop" hint="modal < MSP">
              <table className="w-full text-sm">
                <thead>
                  <tr className="label-mono border-b border-border text-left">
                    <th className="py-2 font-medium">Crop</th>
                    <th className="py-2 text-right font-medium">Crashes</th>
                    <th className="py-2 text-right font-medium">Records</th>
                    <th className="py-2 text-right font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {view.crashRows.map((r) => (
                    <tr key={r.crop}>
                      <td className="py-2 font-medium">{r.crop}</td>
                      <td className="py-2 text-right font-mono text-destructive">{r.crashes}</td>
                      <td className="py-2 text-right font-mono text-muted-foreground">{r.total}</td>
                      <td className="py-2 text-right font-mono">{r.rate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </section>
        </>
      )}
    </Shell>
  );
}
