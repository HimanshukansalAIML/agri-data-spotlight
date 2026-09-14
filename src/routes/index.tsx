import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Kpi, Loading, Panel, Shell } from "@/components/dashboard/Shell";
import { fmtCompact, fmtNum, fmtRupee, useDataset } from "@/lib/dataset";
import { useFilters } from "@/lib/filters";
import { computeKpis, groupSum, useScope } from "@/lib/scope";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MandiGrid — Mandi Arrivals & Price Overview" },
      {
        name: "description",
        content:
          "State-wise dashboard of crop arrivals, wholesale price vs MSP, transit performance and rainfall impact across Indian mandis.",
      },
      { property: "og:title", content: "MandiGrid — Mandi Arrivals & Price Overview" },
      {
        property: "og:description",
        content: "Crop arrivals, MSP gaps, transit delays and rainfall impact by state.",
      },
    ],
  }),
  component: Overview,
});

const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];

function Overview() {
  const { data } = useDataset();
  const filters = useFilters();
  const scope = useScope(data, filters);

  const view = useMemo(() => {
    if (!scope) return null;
    const k = computeKpis(scope);
    const meta = scope.ds.meta;

    const byCrop = [...groupSum(scope.arrivals, (r) => meta.crops[r[2]] ?? "?", (r) => r[3])]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const daily = [...groupSum(scope.arrivals, (r) => r[0], (r) => r[3])]
      .map(([date, qtl]) => ({ date, qtl }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const topMandis = [
      ...groupSum(scope.arrivals, (r) => meta.mandis[r[1]]?.name ?? "?", (r) => r[3]),
    ]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return { k, byCrop, daily, topMandis };
  }, [scope]);

  return (
    <Shell
      title="Overview"
      subtitle={`${filters.state} · ${filters.crop} · last ${filters.days} days`}
    >
      {!view || !scope ? (
        <Loading />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi
              label="Total arrivals"
              value={`${fmtCompact(view.k.totalArrivals)} qtl`}
              note={`${fmtNum(view.k.farmers)} farmer entries`}
            />
            <Kpi
              label="Avg modal price"
              value={fmtRupee(view.k.avgModal)}
              note={`MSP ${fmtRupee(view.k.avgMsp)}`}
            />
            <Kpi
              label="Modal vs MSP"
              value={`${view.k.mspGapPct >= 0 ? "+" : ""}${view.k.mspGapPct.toFixed(1)}%`}
              tone={view.k.mspGapPct >= 0 ? "positive" : "negative"}
              note="average gap"
            />
            <Kpi
              label="Price crashes"
              value={fmtNum(view.k.crashCount)}
              tone="negative"
              note={`${view.k.crashRate.toFixed(1)}% of records below MSP`}
            />
            <Kpi
              label="Avg transit"
              value={`${view.k.avgTransit.toFixed(1)} h`}
              note={`${fmtNum(view.k.tripCount)} trips`}
            />
            <Kpi
              label="Delay rate"
              value={`${view.k.delayRate.toFixed(1)}%`}
              tone={view.k.delayRate > 25 ? "negative" : "neutral"}
              note={`rain × arrivals r = ${view.k.rainCorr.toFixed(2)}`}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <Panel title="Daily arrival trend" hint="quintals" className="xl:col-span-2">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={view.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={30} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCompact(v)} />
                  <Tooltip formatter={(v: number) => `${fmtNum(v)} qtl`} />
                  <Area
                    type="monotone"
                    dataKey="qtl"
                    stroke="var(--color-chart-1)"
                    fill="var(--color-chart-1)"
                    fillOpacity={0.22}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Crop-wise arrival distribution" hint="share of volume">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={view.byCrop}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {view.byCrop.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${fmtNum(v)} qtl`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1 text-xs">
                {view.byCrop.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-sm"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="flex-1">{c.name}</span>
                    <span className="font-mono text-muted-foreground">
                      {fmtCompact(c.value)} qtl
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <Panel title="Top mandis by arrival volume" hint="top 10 · quintals">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={view.topMandis} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCompact(v)} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${fmtNum(v)} qtl`} />
                <Bar dataKey="value" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </>
      )}
    </Shell>
  );
}
