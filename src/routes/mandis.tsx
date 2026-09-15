import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loading, Panel, Shell } from "@/components/dashboard/Shell";
import { fmtCompact, fmtNum, fmtRupee, useDataset } from "@/lib/dataset";
import { useFilters } from "@/lib/filters";
import { useScope } from "@/lib/scope";

export const Route = createFileRoute("/mandis")({
  head: () => ({
    meta: [
      { title: "Mandi Directory & Rankings — MandiGrid" },
      {
        name: "description",
        content:
          "Searchable mandi directory with arrival volume, farmer counts, average modal price and MSP gap by state and district.",
      },
      { property: "og:title", content: "Mandi Directory & Rankings — MandiGrid" },
      {
        property: "og:description",
        content: "Compare mandis on arrivals, prices and MSP gap.",
      },
    ],
  }),
  component: MandisPage,
});

const PAGE_SIZE = 50;

function MandisPage() {
  const { data } = useDataset();
  const filters = useFilters();
  const scope = useScope(data, filters);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    if (!scope) return null;
    const meta = scope.ds.meta;
    type Row = {
      name: string;
      district: string;
      state: string;
      type: string;
      qtl: number;
      farmers: number;
      modalSum: number;
      modalN: number;
      mspSum: number;
      mspN: number;
      trips: number;
    };
    // Start from every mandi in the metadata so mandis without activity in
    // the current filter window still appear (with zero/dash values).
    const map = new Map<number, Row>();
    for (let i = 0; i < meta.mandis.length; i++) {
      const m = meta.mandis[i];
      if (filters.state !== "All" && m && m.state !== filters.state) continue;
      map.set(i, {
        name: m?.name ?? "?",
        district: m?.district ?? "?",
        state: m?.state ?? "?",
        type: m?.type ?? "—",
        qtl: 0,
        farmers: 0,
        modalSum: 0,
        modalN: 0,
        mspSum: 0,
        mspN: 0,
        trips: 0,
      });
    }
    const ensure = (i: number) => {
      let r = map.get(i);
      if (!r) {
        const m = meta.mandis[i];
        r = {
          name: m?.name ?? "?",
          district: m?.district ?? "?",
          state: m?.state ?? "?",
          type: m?.type ?? "—",
          qtl: 0,
          farmers: 0,
          modalSum: 0,
          modalN: 0,
          mspSum: 0,
          mspN: 0,
          trips: 0,
        };
        map.set(i, r);
      }
      return r;
    };

    for (const a of scope.arrivals) {
      const r = ensure(a[1]);
      r.qtl += a[3];
      r.farmers += a[4];
    }
    for (const p of scope.prices) {
      const r = ensure(p[1]);
      if (p[3] != null) {
        r.modalSum += p[3];
        r.modalN++;
      }
      if (p[4] != null) {
        r.mspSum += p[4];
        r.mspN++;
      }
    }
    for (const t of scope.transport) ensure(t[1]).trips++;

    return [...map.values()]
      .map((r) => ({
        ...r,
        modal: r.modalN ? r.modalSum / r.modalN : 0,
        msp: r.mspN ? r.mspSum / r.mspN : 0,
        gap:
          r.modalN && r.mspN
            ? ((r.modalSum / r.modalN - r.mspSum / r.mspN) / (r.mspSum / r.mspN)) * 100
            : 0,
      }))
      .filter((r) =>
        q
          ? `${r.name} ${r.district} ${r.state}`.toLowerCase().includes(q.toLowerCase())
          : true,
      )
      .sort((a, b) => b.qtl - a.qtl);
  }, [scope, q, filters.state]);

  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows ? rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE) : [];

  return (
    <Shell
      title="Mandis"
      subtitle={`${filters.state} · ${filters.crop} · ${filters.days === 0 ? "all data" : `last ${filters.days} days`}`}
    >
      {!rows ? (
        <Loading />
      ) : (
        <Panel title="Mandi directory" hint={`${rows.length} mandis in scope`}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search mandi, district or state…"
            className="mb-3 w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="label-mono border-b border-border text-left">
                  <th className="py-2 font-medium">Mandi</th>
                  <th className="py-2 font-medium">District</th>
                  <th className="py-2 font-medium">State</th>
                  <th className="py-2 text-right font-medium">Arrivals</th>
                  <th className="py-2 text-right font-medium">Farmers</th>
                  <th className="py-2 text-right font-medium">Modal</th>
                  <th className="py-2 text-right font-medium">vs MSP</th>
                  <th className="py-2 text-right font-medium">Trips</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={`${r.name}-${r.district}`}>
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-muted-foreground">{r.district}</td>
                    <td className="py-2 text-muted-foreground">{r.state}</td>
                    <td className="py-2 text-right font-mono">{fmtCompact(r.qtl)}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {fmtNum(r.farmers)}
                    </td>
                    <td className="py-2 text-right font-mono">{fmtRupee(r.modal)}</td>
                    <td
                      className={`py-2 text-right font-mono ${r.gap >= 0 ? "text-positive" : "text-destructive"}`}
                    >
                      {r.gap >= 0 ? "+" : ""}
                      {r.gap.toFixed(1)}%
                    </td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{r.trips}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </Shell>
  );
}
