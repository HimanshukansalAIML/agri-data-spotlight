import { useQuery } from "@tanstack/react-query";

export type Mandi = {
  id: string;
  name: string;
  district: string;
  state: string;
  type: string;
};

export type Meta = {
  mandis: Mandi[];
  crops: string[];
  warehouses: string[];
  districts: string[];
  districtState: Record<string, string>;
  states: string[];
};

/** [date, mandiIdx, cropIdx, qtl, farmers] */
export type ArrivalRow = [string, number, number, number, number];
/** [date, mandiIdx, cropIdx, modal, msp, min, max] */
export type PriceRow = [
  string,
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
];
/** [date, mandiIdx, warehouseIdx, transitHours, distanceKm] */
export type TransportRow = [string, number, number, number | null, number | null];
/** [date, districtIdx, rainMm, tempC, humidity] */
export type WeatherRow = [string, number, number | null, number | null, number | null];

export type Dataset = {
  meta: Meta;
  arrivals: ArrivalRow[];
  prices: PriceRow[];
  transport: TransportRow[];
  weather: WeatherRow[];
  maxDate: string;
};

async function getJson<T>(name: string): Promise<T> {
  const res = await fetch(`/data/${name}.json`);
  if (!res.ok) throw new Error(`Failed to load ${name}`);
  return (await res.json()) as T;
}

async function loadDataset(): Promise<Dataset> {
  const [meta, arrivals, prices, transport, weather] = await Promise.all([
    getJson<Meta>("meta"),
    getJson<ArrivalRow[]>("arrivals"),
    getJson<PriceRow[]>("prices"),
    getJson<TransportRow[]>("transport"),
    getJson<WeatherRow[]>("weather"),
  ]);

  let maxDate = "";
  for (const r of arrivals) if (r[0] > maxDate) maxDate = r[0];
  for (const r of prices) if (r[0] > maxDate) maxDate = r[0];

  return { meta, arrivals, prices, transport, weather, maxDate };
}

export function useDataset() {
  return useQuery({
    queryKey: ["dataset"],
    queryFn: loadDataset,
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: typeof window !== "undefined",
  });
}

export function shiftDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const fmtNum = (n: number, digits = 0) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const fmtCompact = (n: number) => {
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(0);
};

export const fmtRupee = (n: number) => `₹${fmtNum(n, 0)}`;

export function pearson(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = (xs[i] ?? 0) - mx;
    const b = (ys[i] ?? 0) - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/** A trip counts as delayed when it exceeds the expected 45 km/h run plus a 1.5 h buffer. */
export function expectedHours(distanceKm: number | null) {
  return distanceKm == null ? null : distanceKm / 45 + 1.5;
}
