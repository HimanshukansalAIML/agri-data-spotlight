import { expectedHours, shiftDays, type Dataset } from "./dataset";
import type { QuerySpec, SpecResult, SpecRow } from "./query-spec";

function findIdx(list: string[], name: string | null) {
  if (!name) return null;
  const target = name.trim().toLowerCase();
  const exact = list.findIndex((v) => v.toLowerCase() === target);
  if (exact >= 0) return exact;
  const partial = list.findIndex(
    (v) => v.toLowerCase().includes(target) || target.includes(v.toLowerCase()),
  );
  return partial >= 0 ? partial : null;
}

function monday(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function bucketDate(date: string, groupBy: QuerySpec["groupBy"]) {
  if (groupBy === "month") return date.slice(0, 7);
  if (groupBy === "week") return monday(date);
  return date;
}

type Acc = { sum: number; n: number; sum2: number; n2: number; hits: number };
const newAcc = (): Acc => ({ sum: 0, n: 0, sum2: 0, n2: 0, hits: 0 });

/** Runs an AI-produced query spec against the in-browser dataset. */
export function runSpec(ds: Dataset, spec: QuerySpec): SpecResult {
  const meta = ds.meta;
  const mandiNames = meta.mandis.map((m) => m.name);
  const stateName =
    spec.state && meta.states.some((s) => s.toLowerCase() === spec.state?.toLowerCase())
      ? meta.states.find((s) => s.toLowerCase() === spec.state?.toLowerCase())!
      : null;
  const cropIdx = findIdx(meta.crops, spec.crop);
  const mandiIdx = findIdx(mandiNames, spec.mandi);
  const districtIdx = findIdx(meta.districts, spec.district);
  const warehouseIdx = findIdx(meta.warehouses, spec.warehouse);

  const to = ds.maxDate;
  const from = spec.days && spec.days > 0 ? shiftDays(to, -spec.days) : "0000-01-01";
  const inRange = (d: string) => d >= from && d <= to;

  const mandiOk = meta.mandis.map((m, i) => {
    if (stateName && m.state !== stateName) return false;
    if (districtIdx != null && m.district !== meta.districts[districtIdx]) return false;
    if (mandiIdx != null && i !== mandiIdx) return false;
    return true;
  });
  const districtOk = meta.districts.map((d, i) => {
    if (stateName && meta.districtState[d] !== stateName) return false;
    if (districtIdx != null && i !== districtIdx) return false;
    return true;
  });

  const distOfMandi = meta.mandis.map((m) => meta.districts.indexOf(m.district));

  const groups = new Map<string, Acc>();
  const bump = (k: string): Acc => {
    let a = groups.get(k);
    if (!a) {
      a = newAcc();
      groups.set(k, a);
    }
    return a;
  };

  const keyForMandi = (mi: number) => {
    switch (spec.groupBy) {
      case "crop":
        return null; // handled by caller
      case "mandi":
        return mandiNames[mi] ?? "—";
      case "district":
        return meta.mandis[mi]?.district ?? "—";
      case "state":
        return meta.mandis[mi]?.state ?? "—";
      case "none":
        return "Total";
      default:
        return null;
    }
  };

  let unit = "";
  let seriesLabel = spec.title;
  let series2Label: string | undefined;

  const timeGroup = spec.groupBy === "day" || spec.groupBy === "week" || spec.groupBy === "month";

  if (spec.metric === "arrival_qtl" || spec.metric === "farmers") {
    unit = spec.metric === "farmers" ? "farmers" : "quintals";
    seriesLabel = spec.metric === "farmers" ? "Farmers" : "Arrivals (Qtl)";
    for (const r of ds.arrivals) {
      if (!mandiOk[r[1]] || !inRange(r[0])) continue;
      if (cropIdx != null && r[2] !== cropIdx) continue;
      const k = timeGroup
        ? bucketDate(r[0], spec.groupBy)
        : spec.groupBy === "crop"
          ? (meta.crops[r[2]] ?? "—")
          : (keyForMandi(r[1]) ?? "Total");
      const a = bump(k);
      a.sum += spec.metric === "farmers" ? r[4] : r[3];
      a.n += 1;
    }
  } else if (
    spec.metric === "modal_price" ||
    spec.metric === "msp" ||
    spec.metric === "modal_vs_msp"
  ) {
    unit = "₹ per quintal";
    seriesLabel = spec.metric === "msp" ? "MSP" : "Modal price";
    if (spec.metric === "modal_vs_msp") series2Label = "MSP";
    for (const r of ds.prices) {
      if (!mandiOk[r[1]] || !inRange(r[0])) continue;
      if (cropIdx != null && r[2] !== cropIdx) continue;
      const k = timeGroup
        ? bucketDate(r[0], spec.groupBy)
        : spec.groupBy === "crop"
          ? (meta.crops[r[2]] ?? "—")
          : (keyForMandi(r[1]) ?? "Total");
      const a = bump(k);
      const primary = spec.metric === "msp" ? r[4] : r[3];
      if (primary != null) {
        a.sum += primary;
        a.n += 1;
      }
      if (r[4] != null) {
        a.sum2 += r[4];
        a.n2 += 1;
      }
      if (r[3] != null && r[4] != null && r[3] < r[4]) a.hits += 1;
    }
  } else if (spec.metric === "price_distribution") {
    unit = "observations";
    seriesLabel = "Price observations";
    const values: number[] = [];
    for (const r of ds.prices) {
      if (!mandiOk[r[1]] || !inRange(r[0])) continue;
      if (cropIdx != null && r[2] !== cropIdx) continue;
      if (r[3] != null) values.push(r[3]);
    }
    if (values.length) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const buckets = 18;
      const width = Math.max(1, (max - min) / buckets);
      for (const v of values) {
        const b = Math.min(buckets - 1, Math.floor((v - min) / width));
        const lo = Math.round(min + b * width);
        const hi = Math.round(min + (b + 1) * width);
        const a = bump(`${lo}–${hi}`);
        a.sum += 1;
        a.n += 1;
      }
      const rows = [...groups.entries()]
        .map(([key, a]) => ({ key, value: a.sum }))
        .sort((x, y) => Number(x.key.split("–")[0]) - Number(y.key.split("–")[0]));
      return { rows, unit, seriesLabel, rowCount: rows.length };
    }
  } else if (
    spec.metric === "transit_hours" ||
    spec.metric === "delay_rate" ||
    spec.metric === "trip_count"
  ) {
    unit =
      spec.metric === "transit_hours" ? "hours" : spec.metric === "delay_rate" ? "%" : "trips";
    seriesLabel =
      spec.metric === "transit_hours"
        ? "Avg transit (h)"
        : spec.metric === "delay_rate"
          ? "Delay rate (%)"
          : "Trips";
    for (const r of ds.transport) {
      if (!mandiOk[r[1]] || !inRange(r[0])) continue;
      if (warehouseIdx != null && r[2] !== warehouseIdx) continue;
      const k = timeGroup
        ? bucketDate(r[0], spec.groupBy)
        : spec.groupBy === "warehouse"
          ? (meta.warehouses[r[2]] ?? "—")
          : (keyForMandi(r[1]) ?? "Total");
      const a = bump(k);
      a.n += 1;
      if (r[3] != null) {
        a.sum += r[3];
        a.n2 += 1;
        const exp = expectedHours(r[4]);
        if (exp != null && r[3] > exp) a.hits += 1;
      }
    }
  } else if (spec.metric === "rain_mm") {
    unit = "mm";
    seriesLabel = "Rainfall (mm)";
    for (const r of ds.weather) {
      if (!districtOk[r[1]] || !inRange(r[0])) continue;
      const k = timeGroup
        ? bucketDate(r[0], spec.groupBy)
        : spec.groupBy === "state"
          ? (meta.districtState[meta.districts[r[1]] ?? ""] ?? "—")
          : spec.groupBy === "none"
            ? "Total"
            : (meta.districts[r[1]] ?? "—");
      const a = bump(k);
      a.sum += r[2] ?? 0;
      a.n += 1;
    }
  } else if (spec.metric === "rain_vs_arrivals") {
    unit = "mm vs quintals";
    seriesLabel = "Rainfall (mm)";
    series2Label = "Arrivals (Qtl)";
    const rain = new Map<string, number>();
    for (const r of ds.weather) {
      if (!districtOk[r[1]] || !inRange(r[0])) continue;
      const k = `${r[0]}|${r[1]}`;
      rain.set(k, (rain.get(k) ?? 0) + (r[2] ?? 0));
    }
    const arr = new Map<string, number>();
    for (const r of ds.arrivals) {
      if (!mandiOk[r[1]] || !inRange(r[0])) continue;
      if (cropIdx != null && r[2] !== cropIdx) continue;
      const k = `${r[0]}|${distOfMandi[r[1]]}`;
      arr.set(k, (arr.get(k) ?? 0) + r[3]);
    }
    const rows: SpecRow[] = [];
    for (const [k, mm] of rain) {
      const a = arr.get(k);
      if (a != null) rows.push({ key: k.slice(0, 10), value: mm, value2: a });
    }
    return { rows: rows.slice(0, 1500), unit, seriesLabel, series2Label, rowCount: rows.length };
  }

  let rows: SpecRow[] = [...groups.entries()].map(([k, a]) => {
    if (spec.metric === "transit_hours") return { key: k, value: a.n2 ? a.sum / a.n2 : 0 };
    if (spec.metric === "delay_rate") return { key: k, value: a.n2 ? (a.hits / a.n2) * 100 : 0 };
    if (spec.metric === "trip_count") return { key: k, value: a.n };
    if (spec.metric === "modal_price" || spec.metric === "msp")
      return { key: k, value: a.n ? a.sum / a.n : 0 };
    if (spec.metric === "modal_vs_msp")
      return {
        key: k,
        value: a.n ? a.sum / a.n : 0,
        value2: a.n2 ? a.sum2 / a.n2 : 0,
      };
    return { key: k, value: a.sum };
  });

  if (timeGroup || spec.sort === "key_asc") rows.sort((x, y) => x.key.localeCompare(y.key));
  else if (spec.sort === "value_asc") rows.sort((x, y) => x.value - y.value);
  else rows.sort((x, y) => y.value - x.value);

  const total = rows.length;
  const limit = spec.limit > 0 ? Math.min(spec.limit, 500) : 400;
  if (timeGroup) rows = rows.slice(-limit);
  else rows = rows.slice(0, limit);

  return { rows, unit, seriesLabel, series2Label, rowCount: total };
}
