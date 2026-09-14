import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Kpi, Loading, Panel, Shell } from "@/components/dashboard/Shell";
import { expectedHours, fmtCompact, fmtNum, useDataset } from "@/lib/dataset";
import { useFilters } from "@/lib/filters";
import { computeKpis, useScope } from "@/lib/scope";

export const Route = createFileRoute("/logistics")({
  head: () => ({
    meta: [
      { title: "Transit & Warehouse Performance — MandiGrid" },
      {
        name: "description",
        content:
          "Average transit time by warehouse, delay rates, trip volumes and the mandis with the worst transit delays.",
      },
      { property: "og:title", content: "Transit & Warehouse Performance — MandiGrid" },
      {
        property: "og:description",
        content: "Warehouse transit times, delay rates and mandi delay rankings.",
      },
    ],
  }),
  component: LogisticsPage,
});

type Agg = { trips: number; hours: number; hoursN: number; delayed: number; delayN: number; km: number };

function emptyAgg(): Agg {
  return { trips: 0, hours: 0, hoursN: 0, delayed: 0, delayN: 0, km: 0 };
}

function LogisticsPage() {
  const { data } = useDataset();
  const filters = useFilters();
  const scope = useScope(data, filters);

  const view = useMemo(() => {
    if (!scope) return null;
    const meta = scope.ds.meta;
    const k = computeKpis(scope);

    const byWh = new Map<string, Agg>();
    const byMandi = new Map<string, Agg>();

    for (const t of scope.transport) {
      const wh = meta.warehouses[t[2]] ?? "?";
      const mn = meta.mandis[t[1]]?.name ?? "?";
      for (const [map, key] of [
        [byWh, wh],
        [byMandi, mn],
      ] as const) {
        const a = map.get(key) ?? emptyAgg();
        a.trips += 1;
        a.km += t[4] ?? 0;
        if (t[3] != null) {
          a.hours += t[3];
          a.hoursN += 1;
          const exp = expectedHours(t[4]);
          if (exp != null) {
            a.delayN += 1;
            if (t[3] > exp) a.delayed += 1;
          }
        }
        map.set(key, a);
      }
    }

    const whRows = [...byWh]
      .map(([name, a]) => ({
        name,
        trips: a.trips,
        avgHours: a.hoursN ? a.hours / a.hoursN : 0,
        delayRate: a.delayN ? (a.delayed / a.delayN) * 100 : 0,
        avgKm: a.trips ? a.km / a.trips : 0,
      }))
      .sort((x, y) => y.trips - x.trips);

    const mandiRows = [...byMandi]
      .map(([name, a]) => ({
        name,
        trips: a.trips,
        avgHours: a.hoursN ? a.hours / a.hoursN : 0,
        delayRate: a.delayN ? (a.delayed / a.delayN) * 100 : 0,
        avgDelayHours: a.hoursN ? a.hours / a.hoursN : 0,
      }))
      .filter((r) => r.trips >= 5)
      .sort((x, y) => y.delayRate - x.delayRate)
      .slice(0, 12);

    const busiest = [...whRows].sort((a, b) => b.trips - a.trips)[0];

    return { k, whRows, mandiRows, busiest };
  }, [scope]);

  return (
    <Shell
      title="Logistics"
      subtitle={`${filters.state} · last ${filters.days} days · delay = over 45 km/h pace + 1.5 h buffer`}
    >
      {!view ? (
        <Loading />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Trips" value={fmtNum(view.k.tripCount)} note="dispatch records" />
            <Kpi label="Avg transit" value={`${view.k.avgTransit.toFixed(1)} h`} />
            <Kpi
              label="Delay rate"
              value={`${view.k.delayRate.toFixed(1)}%`}
              tone={view.k.delayRate > 25 ? "negative" : "neutral"}
            />
            <Kpi
              label="Busiest warehouse"
              value={view.busiest?.name ?? "—"}
              note={`${fmtNum(view.busiest?.trips ?? 0)} trips`}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Average transit time by warehouse" hint="hours">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={view.whRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(1)} h`} />
                  <Bar dataKey="avgHours" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Warehouse intake volume" hint="trips received">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={view.whRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCompact(v)} />
                  <Tooltip formatter={(v: number) => `${fmtNum(v)} trips`} />
                  <Bar dataKey="trips" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </section>

          <Panel title="Mandis with the highest transit delay" hint="min. 5 trips">
            <table className="w-full text-sm">
              <thead>
                <tr className="label-mono border-b border-border text-left">
                  <th className="py-2 font-medium">Mandi</th>
                  <th className="py-2 text-right font-medium">Trips</th>
                  <th className="py-2 text-right font-medium">Avg transit</th>
                  <th className="py-2 text-right font-medium">Delay rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {view.mandiRows.map((r) => (
                  <tr key={r.name}>
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{r.trips}</td>
                    <td className="py-2 text-right font-mono">{r.avgHours.toFixed(1)} h</td>
                    <td className="py-2 text-right font-mono text-destructive">
                      {r.delayRate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="Warehouse summary" hint="transit · delay · distance">
            <table className="w-full text-sm">
              <thead>
                <tr className="label-mono border-b border-border text-left">
                  <th className="py-2 font-medium">Warehouse</th>
                  <th className="py-2 text-right font-medium">Trips</th>
                  <th className="py-2 text-right font-medium">Avg transit</th>
                  <th className="py-2 text-right font-medium">Avg distance</th>
                  <th className="py-2 text-right font-medium">Delay rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {view.whRows.map((r) => (
                  <tr key={r.name}>
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{r.trips}</td>
                    <td className="py-2 text-right font-mono">{r.avgHours.toFixed(1)} h</td>
                    <td className="py-2 text-right font-mono">{r.avgKm.toFixed(0)} km</td>
                    <td className="py-2 text-right font-mono">{r.delayRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </Shell>
  );
}
