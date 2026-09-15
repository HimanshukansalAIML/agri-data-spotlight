import { z } from "zod";

export const METRICS = [
  "arrival_qtl",
  "farmers",
  "modal_price",
  "msp",
  "modal_vs_msp",
  "transit_hours",
  "delay_rate",
  "trip_count",
  "rain_mm",
  "price_distribution",
  "rain_vs_arrivals",
] as const;

export const GROUP_BYS = [
  "day",
  "week",
  "month",
  "crop",
  "mandi",
  "warehouse",
  "district",
  "state",
  "none",
] as const;

export const CHARTS = ["line", "area", "bar", "pie", "scatter", "table", "kpi"] as const;

export const querySpecSchema = z.object({
  title: z.string(),
  metric: z.enum(METRICS),
  groupBy: z.enum(GROUP_BYS),
  chart: z.enum(CHARTS),
  state: z.string().nullable(),
  crop: z.string().nullable(),
  mandi: z.string().nullable(),
  district: z.string().nullable(),
  warehouse: z.string().nullable(),
  days: z.number().nullable(),
  sort: z.enum(["value_desc", "value_asc", "key_asc"]),
  limit: z.number(),
  note: z.string(),
});

export type QuerySpec = z.infer<typeof querySpecSchema>;

export type SpecRow = { key: string; value: number; value2?: number };

export type SpecResult = {
  rows: SpecRow[];
  unit: string;
  seriesLabel: string;
  series2Label?: string;
  rowCount: number;
};

export const SPEC_GUIDE = `You turn a question about an Indian mandi (agricultural market) dataset into ONE query spec, returned as raw JSON only.

Fields:
- title: short chart title.
- metric: one of ${METRICS.join(", ")}.
    arrival_qtl = crop arrival volume in quintals; farmers = number of farmers;
    modal_price = avg wholesale modal price; msp = avg minimum support price;
    modal_vs_msp = modal price and MSP as two series (use for "vs MSP" / price crash questions);
    transit_hours = avg transit time; delay_rate = % of trips slower than expected;
    trip_count = number of transport trips; rain_mm = total rainfall;
    price_distribution = histogram of modal prices (groupBy is ignored);
    rain_vs_arrivals = scatter of district-day rainfall (x) against arrivals (y).
- groupBy: one of ${GROUP_BYS.join(", ")}. Use day/week/month for trends over time, "none" for a single number.
- chart: one of ${CHARTS.join(", ")}. line/area for time trends, bar for rankings, pie for share of a whole,
    scatter only with rain_vs_arrivals, table for detailed lists, kpi when groupBy is none.
- state, crop, mandi, district, warehouse: exact names copied from the catalog, or null for no filter.
- days: lookback window in days (e.g. 30 or 90), or null for the whole dataset.
- sort: value_desc for rankings, key_asc for time series.
- limit: max rows to chart (use 10-15 for rankings, 400 for time series).
- note: one short sentence describing what the chart shows.

Rules: only use names present in the catalog; if the question names something not in the catalog, pick the
closest catalog entry or leave that filter null. Reply with JSON only, no markdown fences, no commentary.`;
