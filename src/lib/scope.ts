import { useMemo } from "react";
import { ALL, type Filters } from "./filters";
import {
  expectedHours,
  pearson,
  shiftDays,
  type ArrivalRow,
  type Dataset,
  type PriceRow,
  type TransportRow,
  type WeatherRow,
} from "./dataset";

export type Scope = {
  ds: Dataset;
  from: string;
  to: string;
  mandiInScope: boolean[];
  districtInScope: boolean[];
  arrivals: ArrivalRow[];
  prices: PriceRow[];
  transport: TransportRow[];
  weather: WeatherRow[];
  cropIdx: number | null;
};

export function useScope(ds: Dataset | undefined, filters: Filters): Scope | null {
  return useMemo(() => {
    if (!ds) return null;
    const to = ds.maxDate;
    const from = filters.days === 0 ? "0000-01-01" : shiftDays(to, -filters.days);

    const mandiInScope = ds.meta.mandis.map(
      (m) => filters.state === ALL || m.state === filters.state,
    );
    const districtInScope = ds.meta.districts.map(
      (d) => filters.state === ALL || ds.meta.districtState[d] === filters.state,
    );

    const cropIdx =
      filters.crop === ALL ? null : ds.meta.crops.indexOf(filters.crop) >= 0
        ? ds.meta.crops.indexOf(filters.crop)
        : null;

    const inRange = (d: string) => d >= from && d <= to;

    const arrivals = ds.arrivals.filter(
      (r) => mandiInScope[r[1]] && inRange(r[0]) && (cropIdx === null || r[2] === cropIdx),
    );
    const prices = ds.prices.filter(
      (r) => mandiInScope[r[1]] && inRange(r[0]) && (cropIdx === null || r[2] === cropIdx),
    );
    const transport = ds.transport.filter((r) => mandiInScope[r[1]] && inRange(r[0]));
    const weather = ds.weather.filter((r) => districtInScope[r[1]] && inRange(r[0]));

    return {
      ds,
      from,
      to,
      mandiInScope,
      districtInScope,
      arrivals,
      prices,
      transport,
      weather,
      cropIdx,
    };
  }, [ds, filters.state, filters.crop, filters.days]);
}

export function sumBy<T>(rows: T[], get: (r: T) => number) {
  let total = 0;
  for (const r of rows) total += get(r);
  return total;
}

export function groupSum<T>(rows: T[], key: (r: T) => string, val: (r: T) => number) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + val(r));
  return map;
}

export function groupAvg<T>(rows: T[], key: (r: T) => string, val: (r: T) => number | null) {
  const map = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const v = val(r);
    if (v == null || Number.isNaN(v)) continue;
    const cur = map.get(key(r)) ?? { sum: 0, n: 0 };
    cur.sum += v;
    cur.n += 1;
    map.set(key(r), cur);
  }
  return new Map([...map].map(([k, v]) => [k, v.sum / v.n]));
}

export type Kpis = {
  totalArrivals: number;
  farmers: number;
  avgModal: number;
  avgMsp: number;
  mspGapPct: number;
  crashCount: number;
  crashRate: number;
  avgTransit: number;
  delayRate: number;
  rainCorr: number;
  tripCount: number;
};

export function computeKpis(scope: Scope): Kpis {
  const totalArrivals = sumBy(scope.arrivals, (r) => r[3]);
  const farmers = sumBy(scope.arrivals, (r) => r[4]);

  let modalSum = 0;
  let modalN = 0;
  let mspSum = 0;
  let mspN = 0;
  let crash = 0;
  let compared = 0;
  for (const p of scope.prices) {
    if (p[3] != null) {
      modalSum += p[3];
      modalN++;
    }
    if (p[4] != null) {
      mspSum += p[4];
      mspN++;
    }
    if (p[3] != null && p[4] != null) {
      compared++;
      if (p[3] < p[4]) crash++;
    }
  }

  let transitSum = 0;
  let transitN = 0;
  let delayed = 0;
  let delayN = 0;
  for (const t of scope.transport) {
    if (t[3] != null) {
      transitSum += t[3];
      transitN++;
      const exp = expectedHours(t[4]);
      if (exp != null) {
        delayN++;
        if (t[3] > exp) delayed++;
      }
    }
  }

  // Rainfall vs arrivals correlation, paired by district-day.
  const rainByKey = groupSum(scope.weather, (r) => `${r[0]}|${r[1]}`, (r) => r[2] ?? 0);
  const distOfMandi = scope.ds.meta.mandis.map((m) => scope.ds.meta.districts.indexOf(m.district));
  const arrByKey = groupSum(
    scope.arrivals,
    (r) => `${r[0]}|${distOfMandi[r[1]]}`,
    (r) => r[3],
  );
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [k, rain] of rainByKey) {
    const a = arrByKey.get(k);
    if (a != null) {
      xs.push(rain);
      ys.push(a);
    }
  }

  return {
    totalArrivals,
    farmers,
    avgModal: modalN ? modalSum / modalN : 0,
    avgMsp: mspN ? mspSum / mspN : 0,
    mspGapPct: mspN && modalN ? ((modalSum / modalN - mspSum / mspN) / (mspSum / mspN)) * 100 : 0,
    crashCount: crash,
    crashRate: compared ? (crash / compared) * 100 : 0,
    avgTransit: transitN ? transitSum / transitN : 0,
    delayRate: delayN ? (delayed / delayN) * 100 : 0,
    rainCorr: pearson(xs, ys),
    tripCount: scope.transport.length,
  };
}
