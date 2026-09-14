import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Kpi, Loading, Panel, Shell } from "@/components/dashboard/Shell";
import { fmtCompact, fmtNum, pearson, useDataset } from "@/lib/dataset";
import { useFilters } from "@/lib/filters";
import { groupAvg, groupSum, useScope } from "@/lib/scope";

export const Route = createFileRoute("/weather")({
  head: () => ({
    meta: [
      { title: "Rainfall & Weather Impact — MandiGrid" },
      {
        name: "description",
        content:
          "District rainfall totals, temperature and humidity, and the correlation between rainfall and mandi arrival volume.",
      },
      { property: "og:title", content: "Rainfall & Weather Impact — MandiGrid" },
      {
        property: "og:description",
        content: "See how rainfall by district moves crop arrival volumes.",
      },
    ],
  }),
  component: WeatherPage,
});

function WeatherPage() {
  const { data } = useDataset();
  const filters = useFilters();
  const scope = useScope(data, filters);

  const view = useMemo(() => {
    if (!scope) return null;
    const meta = scope.ds.meta;

    const rainByDistrict = groupSum(scope.weather, (r) => meta.districts[r[1]] ?? "?", (r) => r[2] ?? 0);
    const tempByDistrict = groupAvg(scope.weather, (r) => meta.districts[r[1]] ?? "?", (r) => r[3]);
    const humByDistrict = groupAvg(scope.weather, (r) => meta.districts[r[1]] ?? "?", (r) => r[4]);
    const arrByDistrict = groupSum(
      scope.arrivals,
      (r) => meta.mandis[r[1]]?.district ?? "?",
      (r) => r[3],
    );

    const districts = [...rainByDistrict]
      .map(([name, rain]) => ({
        name,
        rain,
        temp: tempByDistrict.get(name) ?? 0,
        humidity: humByDistrict.get(name) ?? 0,
        arrivals: arrByDistrict.get(name) ?? 0,
      }))
      .sort((a, b) => b.rain - a.rain);

    // Daily district pairs for correlation + scatter
    const rainDaily = groupSum(scope.weather, (r) => `${r[0]}|${r[1]}`, (r) => r[2] ?? 0);
    const distIndex = new Map(meta.districts.map((d, i) => [d, i]));
    const arrDaily = groupSum(
      scope.arrivals,
      (r) => `${r[0]}|${distIndex.get(meta.mandis[r[1]]?.district ?? "") ?? -1}`,
      (r) => r[3],
    );
    const points: { rain: number; arrivals: number }[] = [];
    for (const [k, rain] of rainDaily) {
      const a = arrDaily.get(k);
      if (a != null) points.push({ rain: Math.round(rain), arrivals: Math.round(a) });
    }
    const corr = pearson(points.map((p) => p.rain), points.map((p) => p.arrivals));

    const totalRain = districts.reduce((s, d) => s + d.rain, 0);
    const avgTemp =
      districts.length ? districts.reduce((s, d) => s + d.temp, 0) / districts.length : 0;

    return { districts, points: points.slice(0, 4000), corr, totalRain, avgTemp };
  }, [scope]);

  return (
    <Shell
      title="Weather impact"
      subtitle={`${filters.state} · ${filters.days === 0 ? "all data" : `last ${filters.days} days`}`}
    >
      {!view ? (
        <Loading />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Total rainfall" value={`${fmtCompact(view.totalRain)} mm`} note="all sensors" />
            <Kpi label="Avg temperature" value={`${view.avgTemp.toFixed(1)} °C`} />
            <Kpi
              label="Rain × arrivals"
              value={view.corr.toFixed(2)}
              tone={view.corr < 0 ? "negative" : "positive"}
              note="Pearson correlation"
            />
            <Kpi label="Districts covered" value={String(view.districts.length)} />
          </section>

          <Panel title="Rainfall by district" hint="total mm in window">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={view.districts}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCompact(v)} />
                <Tooltip formatter={(v: number) => `${fmtNum(v)} mm`} />
                <Bar dataKey="rain" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Rainfall vs arrival volume" hint="district-day points">
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    type="number"
                    dataKey="rain"
                    name="Rainfall (mm)"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="arrivals"
                    name="Arrivals (qtl)"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => fmtCompact(v)}
                  />
                  <ZAxis range={[18, 18]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Legend />
                  <Scatter
                    name="District-day"
                    data={view.points}
                    fill="var(--color-chart-2)"
                    fillOpacity={0.45}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="District weather & arrivals" hint="rain · temp · humidity">
              <div className="max-h-[300px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="label-mono border-b border-border text-left">
                      <th className="py-2 font-medium">District</th>
                      <th className="py-2 text-right font-medium">Rain</th>
                      <th className="py-2 text-right font-medium">Temp</th>
                      <th className="py-2 text-right font-medium">Humidity</th>
                      <th className="py-2 text-right font-medium">Arrivals</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {view.districts.map((d) => (
                      <tr key={d.name}>
                        <td className="py-2 font-medium">{d.name}</td>
                        <td className="py-2 text-right font-mono">{fmtNum(d.rain)} mm</td>
                        <td className="py-2 text-right font-mono">{d.temp.toFixed(1)} °C</td>
                        <td className="py-2 text-right font-mono">{d.humidity.toFixed(0)}%</td>
                        <td className="py-2 text-right font-mono text-muted-foreground">
                          {fmtCompact(d.arrivals)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>
        </>
      )}
    </Shell>
  );
}
